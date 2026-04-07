import type { Document } from "@/types";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentViewer({ documents }: { documents: Document[] }) {
  if (documents.length === 0) {
    return (
      <div className="rounded-[10px] bg-white p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-3">Documents</h3>
        <p className="text-sm text-gray-500">No documents uploaded.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] bg-white p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-4">
        Documents ({documents.length})
      </h3>
      <div className="space-y-2">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between rounded-lg bg-[#f0f5f0] p-3.5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#d6e4d6]">
                <svg
                  className="h-5 w-5 text-[#3a5c3a]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{doc.fileName}</p>
                <p className="text-xs text-gray-500">
                  {doc.documentType} &middot; {formatFileSize(doc.fileSize)}
                </p>
              </div>
            </div>
            <a
              href={`/api/files/${doc.storagePath}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#333333] transition-colors"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
              View
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
