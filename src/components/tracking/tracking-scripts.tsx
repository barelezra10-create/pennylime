import Script from "next/script";
import { getTrackingConfig } from "@/lib/tracking/config";

export async function TrackingScripts() {
  let cfg;
  try {
    cfg = await getTrackingConfig();
  } catch {
    return null;
  }

  if (!cfg.enabled) return null;

  const gtagIds = [cfg.googleAdsConversionId, cfg.ga4MeasurementId].filter(Boolean) as string[];
  const showGtag = gtagIds.length > 0;
  const primaryGtagId = gtagIds[0];

  const mappingsBootstrap = `window.__plMappings = ${cfg.eventMappings || "{}"}; window.__plPlatformIds = ${JSON.stringify(
    {
      googleAdsConversionId: cfg.googleAdsConversionId,
      ga4MeasurementId: cfg.ga4MeasurementId,
      metaPixelId: cfg.metaPixelId,
      tiktokPixelId: cfg.tiktokPixelId,
      microsoftUetTagId: cfg.microsoftUetTagId,
    }
  )};`;

  return (
    <>
      <Script id="pl-mappings" strategy="beforeInteractive">
        {mappingsBootstrap}
      </Script>
      {showGtag && primaryGtagId && (
        <>
          <Script
            id="gtag-loader"
            src={`https://www.googletagmanager.com/gtag/js?id=${primaryGtagId}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              ${gtagIds.map((id) => `gtag('config', '${id}', { send_page_view: true });`).join("\n")}
            `}
          </Script>
        </>
      )}

      {cfg.metaPixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${cfg.metaPixelId}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}

      {cfg.tiktokPixelId && (
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`
            !function (w, d, t) {w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
            ttq.load('${cfg.tiktokPixelId}');
            ttq.page();
            }(window, document, 'ttq');
          `}
        </Script>
      )}

      {cfg.microsoftUetTagId && (
        <Script id="microsoft-uet" strategy="afterInteractive">
          {`
            (function(w,d,t,r,u){var f,n,i;w[u]=w[u]||[],f=function(){var o={ti:"${cfg.microsoftUetTagId}",enableAutoSpaTracking:true};o.q=w[u],w[u]=new UET(o),w[u].push("pageLoad")},n=d.createElement(t),n.src=r,n.async=1,n.onload=n.onreadystatechange=function(){var s=this.readyState;s&&s!=="loaded"&&s!=="complete"||(f(),n.onload=n.onreadystatechange=null)},i=d.getElementsByTagName(t)[0],i.parentNode.insertBefore(n,i)})(window,document,"script","//bat.bing.com/bat.js","uetq");
          `}
        </Script>
      )}

      {cfg.customHeadHtml && (
        <Script id="custom-head" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: cfg.customHeadHtml }} />
      )}
    </>
  );
}
