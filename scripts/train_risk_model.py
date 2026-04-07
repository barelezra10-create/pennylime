#!/usr/bin/env python3
"""
Risk model training script for the loan portal.

Usage:
  python3 scripts/train_risk_model.py --seed     # Cold-start with synthetic data
  python3 scripts/train_risk_model.py --retrain   # Retrain from real loan outcomes

Reads/writes to the SQLite database at dev.db (project root).
Exports model coefficients to both the RiskModel table and risk-model.json.
"""

import argparse
import json
import os
import sqlite3
import sys
import uuid
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score

DB_PATH = Path(__file__).parent.parent / "dev.db"
MODEL_JSON_PATH = Path(__file__).parent.parent / "risk-model.json"

FEATURE_CONFIG = [
    {"name": "income_to_loan_ratio", "cap": 5.0, "divisor": 5.0},
    {"name": "bank_balance_ratio", "cap": 2.0, "divisor": 2.0},
    {"name": "platform_risk", "cap": 1.0, "divisor": 1.0},
    {"name": "loan_term", "cap": 18.0, "divisor": 18.0},
    {"name": "document_score", "cap": 1.0, "divisor": 1.0},
    {"name": "repayment_history", "cap": 1.0, "divisor": 1.0},
    {"name": "aggregate_exposure", "cap": 3.0, "divisor": 3.0},
]

PLATFORM_RISK = {
    "uber": 0.25, "lyft": 0.30, "doordash": 0.35, "grubhub": 0.40,
    "instacart": 0.35, "postmates": 0.45, "amazon_flex": 0.30, "shipt": 0.40,
    "taskrabbit": 0.55, "fiverr": 0.60, "upwork": 0.50, "rover": 0.55,
    "handy": 0.60, "thumbtack": 0.55,
}


def normalize(value, cap, divisor):
    return min(value, cap) / divisor


def get_db():
    if not DB_PATH.exists():
        print(f"ERROR: Database not found at {DB_PATH}")
        sys.exit(1)
    return sqlite3.connect(str(DB_PATH))


def get_next_version(conn):
    cursor = conn.execute("SELECT MAX(version) FROM RiskModel")
    row = cursor.fetchone()
    return (row[0] or 0) + 1


def save_model(conn, coefficients, intercept, training_size, accuracy, precision, recall):
    """Save model to both DB and JSON file."""
    version = get_next_version(conn)
    model_id = str(uuid.uuid4())

    # Deactivate previous models
    conn.execute("UPDATE RiskModel SET isActive = 0 WHERE isActive = 1")

    # Insert new model
    conn.execute(
        """INSERT INTO RiskModel (id, version, coefficients, intercept, features,
           trainingSize, accuracy, precision, recall, isActive, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))""",
        (
            model_id,
            version,
            json.dumps(coefficients.tolist()),
            float(intercept),
            json.dumps(FEATURE_CONFIG),
            training_size,
            float(accuracy),
            float(precision),
            float(recall),
        ),
    )
    conn.commit()

    # Export to JSON
    model_json = {
        "id": model_id,
        "version": version,
        "coefficients": coefficients.tolist(),
        "intercept": float(intercept),
        "features": FEATURE_CONFIG,
        "trainingSize": training_size,
        "accuracy": float(accuracy),
        "precision": float(precision),
        "recall": float(recall),
    }
    MODEL_JSON_PATH.write_text(json.dumps(model_json, indent=2))

    print(f"Model v{version} saved (id: {model_id})")
    print(f"  Training size: {training_size}")
    print(f"  Accuracy: {accuracy:.3f}")
    print(f"  Precision: {precision:.3f}")
    print(f"  Recall: {recall:.3f}")
    print(f"  Coefficients: {coefficients.tolist()}")
    print(f"  Intercept: {float(intercept):.4f}")
    print(f"  Exported to: {MODEL_JSON_PATH}")

    return model_id


def seed():
    """Generate cold-start model from synthetic lending data."""
    print("Generating synthetic training data...")
    np.random.seed(42)
    n_samples = 2000

    # Generate features based on typical lending distributions
    income_ratio = np.random.lognormal(mean=0.7, sigma=0.5, size=n_samples)
    balance_ratio = np.random.lognormal(mean=0.0, sigma=0.6, size=n_samples)
    platform_risk = np.random.beta(2, 3, size=n_samples)  # skews lower
    loan_term = np.random.uniform(3, 18, size=n_samples)
    doc_score = np.random.beta(5, 2, size=n_samples)  # skews higher
    history = np.random.beta(3, 2, size=n_samples)  # slightly above 0.5
    exposure = np.random.exponential(0.3, size=n_samples)

    # Normalize
    X = np.column_stack([
        np.clip(income_ratio, 0, 5) / 5,
        np.clip(balance_ratio, 0, 2) / 2,
        platform_risk,
        loan_term / 18,
        doc_score,
        history,
        np.clip(exposure, 0, 3) / 3,
    ])

    # Generate default labels based on realistic relationships
    # Higher income ratio, balance, docs, history → less likely to default
    # Higher platform risk, loan term, exposure → more likely to default
    z = (
        -2.0  # intercept (base default rate ~12%)
        - 1.5 * X[:, 0]  # income ratio (protective)
        - 0.8 * X[:, 1]  # balance ratio (protective)
        + 1.2 * X[:, 2]  # platform risk (risk factor)
        + 0.6 * X[:, 3]  # loan term (risk factor)
        - 0.5 * X[:, 4]  # doc score (protective)
        - 1.0 * X[:, 5]  # history (protective)
        + 0.9 * X[:, 6]  # exposure (risk factor)
    )
    prob = 1 / (1 + np.exp(-z))
    y = (np.random.random(n_samples) < prob).astype(int)

    print(f"Default rate in synthetic data: {y.mean():.1%}")

    # Train
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model = LogisticRegression(class_weight="balanced", random_state=42, max_iter=1000)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec = recall_score(y_test, y_pred, zero_division=0)

    print(f"\nSeed model performance:")
    print(f"  Accuracy:  {acc:.3f}")
    print(f"  Precision: {prec:.3f}")
    print(f"  Recall:    {rec:.3f}")

    conn = get_db()
    save_model(conn, model.coef_[0], model.intercept_[0], n_samples, acc, prec, rec)
    conn.close()

    print("\nSeed complete. Run the app and the model will be used for scoring.")


def retrain():
    """Retrain model from real loan outcome data."""
    conn = get_db()

    # Check minimum data requirement
    cursor = conn.execute("SELECT value FROM LoanRule WHERE key = 'retrain_min_data'")
    row = cursor.fetchone()
    min_data = int(row[0]) if row else 30

    # Load risk profiles with application data
    df = pd.read_sql_query(
        """
        SELECT rp.outcome, rp.latePaymentCount, rp.loanTermMonths,
               rp.monthlyIncome, rp.loanAmount, rp.ssnHash,
               a.bankBalance, a.platform
        FROM RiskProfile rp
        JOIN Application a ON a.id = rp.applicationId
        WHERE rp.outcome IN ('PAID_OFF', 'DEFAULTED')
        """,
        conn,
    )

    if len(df) < min_data:
        print(f"Insufficient data: {len(df)} profiles, need {min_data}. Skipping retrain.")
        conn.close()
        sys.exit(0)

    print(f"Training on {len(df)} loan outcomes...")

    # Build feature matrix
    features = []
    labels = []

    for _, row in df.iterrows():
        loan_amount = float(row["loanAmount"])
        monthly_income = float(row["monthlyIncome"]) if row["monthlyIncome"] else None
        bank_balance = float(row["bankBalance"]) if row["bankBalance"] else None
        platform = row["platform"]
        term = int(row["loanTermMonths"]) if row["loanTermMonths"] else 12
        late_count = int(row["latePaymentCount"])

        # Get document count from application (approximate with required_pay_stubs)
        doc_score = 1.0  # funded loans had enough docs

        # Repayment history from OTHER loans by same borrower
        ssn_hash = row["ssnHash"]
        hist_cursor = conn.execute(
            "SELECT latePaymentCount, outcome, loanTermMonths FROM RiskProfile WHERE ssnHash = ? AND applicationId != (SELECT id FROM Application WHERE ssnHash = ? LIMIT 1)",
            (ssn_hash, ssn_hash),
        )
        hist_rows = hist_cursor.fetchall()
        if hist_rows:
            total_late = sum(r[0] for r in hist_rows)
            total_terms = sum(r[2] or 12 for r in hist_rows)
            any_default = any(r[1] == "DEFAULTED" for r in hist_rows)
            history_score = (1 - (total_late / total_terms if total_terms > 0 else 0)) * (0.5 if any_default else 1.0)
        else:
            history_score = 0.5

        # Aggregate exposure (0 for completed loans — they're done)
        exposure = 0.0

        income_ratio = (monthly_income * term / loan_amount) if monthly_income else 2.5
        balance_ratio = (bank_balance / loan_amount) if bank_balance else 1.0
        platform_risk = PLATFORM_RISK.get(platform.lower() if platform else "", 0.5)

        feature_vec = [
            normalize(income_ratio, 5.0, 5.0),
            normalize(balance_ratio, 2.0, 2.0),
            platform_risk,
            normalize(term, 18, 18),
            doc_score,
            history_score,
            normalize(exposure, 3.0, 3.0),
        ]

        features.append(feature_vec)
        labels.append(1 if row["outcome"] == "DEFAULTED" else 0)

    X = np.array(features)
    y = np.array(labels)

    print(f"Default rate: {y.mean():.1%}")

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model = LogisticRegression(class_weight="balanced", random_state=42, max_iter=1000)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec = recall_score(y_test, y_pred, zero_division=0)

    print(f"\nRetrained model performance:")
    print(f"  Accuracy:  {acc:.3f}")
    print(f"  Precision: {prec:.3f}")
    print(f"  Recall:    {rec:.3f}")

    # Check accuracy threshold
    if acc < 0.6:
        print(f"\nWARNING: Accuracy {acc:.3f} < 0.60 threshold. NOT deploying new model.")
        conn.close()
        sys.exit(0)

    save_model(conn, model.coef_[0], model.intercept_[0], len(df), acc, prec, rec)
    conn.close()

    print("\nRetrain complete. New model is now active.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train risk scoring model")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--seed", action="store_true", help="Generate cold-start model from synthetic data")
    group.add_argument("--retrain", action="store_true", help="Retrain from real loan outcomes")
    args = parser.parse_args()

    if args.seed:
        seed()
    else:
        retrain()
