type JsonRecord = Record<string, unknown>;

export type PdfAnnotationPayload = {
  strokes: unknown[];
  updatedAt?: string;
  version?: number;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toEmbeddedJson(value: unknown) {
  return JSON.stringify(value ?? null)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function normalizePdfAnnotationPayload(rawPayload: unknown): PdfAnnotationPayload | undefined {
  if (Array.isArray(rawPayload)) {
    return {
      strokes: rawPayload,
      version: 1,
    };
  }

  if (!isRecord(rawPayload)) {
    return undefined;
  }

  return {
    ...rawPayload,
    strokes: Array.isArray(rawPayload.strokes) ? rawPayload.strokes : [],
    updatedAt: typeof rawPayload.updatedAt === 'string' ? rawPayload.updatedAt : undefined,
    version: typeof rawPayload.version === 'number' ? rawPayload.version : 1,
  };
}

export function createReadonlyPdfViewerHtml(pdfUrl: string, annotations?: PdfAnnotationPayload) {
  const pdfUrlJson = toEmbeddedJson(pdfUrl);
  const annotationsJson = toEmbeddedJson(annotations ?? { strokes: [], version: 1 });

  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=4, user-scalable=yes" />
    <style>
      * {
        -webkit-tap-highlight-color: transparent;
        box-sizing: border-box;
      }

      html,
      body {
        background: #ffffff;
        color: #202329;
        font-family: -apple-system, BlinkMacSystemFont, "Pretendard", "Apple SD Gothic Neo", sans-serif;
        height: 100%;
        margin: 0;
        min-height: 100%;
        overflow: hidden;
      }

      #viewer {
        background: #ffffff;
        height: 100vh;
        overflow-x: hidden;
        overflow-y: auto;
        padding: 14px 14px 34px;
        -webkit-overflow-scrolling: touch;
        width: 100vw;
      }

      .status {
        align-items: center;
        color: #8b919c;
        display: flex;
        font-size: 15px;
        font-weight: 800;
        min-height: 260px;
        justify-content: center;
        text-align: center;
      }

      .page-block {
        margin: 0 auto 18px;
        max-width: 980px;
        width: 100%;
      }

      .page-label {
        color: #96a0af;
        font-size: 12px;
        font-weight: 900;
        line-height: 1;
        margin: 0 0 8px 2px;
      }

      .page-card {
        background: #ffffff;
        border: 1px solid #e1e7f0;
        border-radius: 18px;
        box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
        margin: 0 auto;
        overflow: hidden;
        position: relative;
      }

      .page-loading {
        align-items: center;
        color: #a0a8b5;
        display: flex;
        font-size: 13px;
        font-weight: 800;
        height: 100%;
        justify-content: center;
        left: 0;
        position: absolute;
        top: 0;
        width: 100%;
      }

      .pdf-canvas {
        display: block;
        width: 100%;
      }

      .highlight-canvas,
      .ink-canvas {
        height: 100%;
        left: 0;
        pointer-events: none;
        position: absolute;
        top: 0;
        width: 100%;
      }

      .highlight-canvas {
        mix-blend-mode: multiply;
      }
    </style>
  </head>
  <body>
    <main id="viewer">
      <div class="status">PDF를 여는 중입니다.</div>
    </main>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <script>
      const PDF_URL = ${pdfUrlJson};
      const ANNOTATION_PAYLOAD = ${annotationsJson};
      const viewer = document.getElementById("viewer");
      const annotationStrokes = Array.isArray(ANNOTATION_PAYLOAD && ANNOTATION_PAYLOAD.strokes)
        ? ANNOTATION_PAYLOAD.strokes
        : Array.isArray(ANNOTATION_PAYLOAD)
          ? ANNOTATION_PAYLOAD
          : [];
      let pdfDocument = null;
      let renderToken = 0;
      let resizeTimer = null;
      let hasRenderedPdf = false;
      let lastLayoutWidth = 0;
      let pageObserver = null;
      let cleanupTimer = null;

      function showStatus(message) {
        viewer.innerHTML = '<div class="status">' + message + '</div>';
      }

      function getLayoutWidth() {
        return Math.round(document.documentElement.clientWidth || window.innerWidth || 0);
      }

      function clampNumber(value, min, max) {
        return Math.min(max, Math.max(min, Number(value) || 0));
      }

      function getPointValue(point, key, fallbackIndex) {
        if (Array.isArray(point)) return Number(point[fallbackIndex]) || 0;
        if (point && typeof point === "object") return Number(point[key]) || 0;
        return 0;
      }

      function getStrokeWidth(stroke) {
        if (stroke.mode === "eraser") return Number(stroke.width) || 18;
        if (stroke.type === "highlighter") return Number(stroke.width) || 12;
        return Number(stroke.width) || 3.2;
      }

      function getActiveAnnotationContexts(stroke, inkContext, highlightContext) {
        if (stroke.mode === "eraser") return [inkContext, highlightContext];
        if (stroke.type === "highlighter") return [highlightContext];
        return [inkContext];
      }

      function configureAnnotationContext(context, stroke) {
        context.globalCompositeOperation = stroke.mode === "eraser" ? "destination-out" : "source-over";
        context.globalAlpha = stroke.mode !== "eraser" && stroke.type === "highlighter" ? 0.5 : 1;
        context.strokeStyle = stroke.color || "#1F78FF";
        context.lineWidth = getStrokeWidth(stroke);
        context.lineCap = "round";
        context.lineJoin = "round";
      }

      function clearCanvas(canvas, context) {
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.restore();
      }

      function drawAnnotationStroke(stroke, inkContext, highlightContext, width, height) {
        if (!stroke || !Array.isArray(stroke.points) || !stroke.points.length) return;

        const contexts = getActiveAnnotationContexts(stroke, inkContext, highlightContext);
        contexts.forEach(function drawOnContext(context) {
          context.save();
          configureAnnotationContext(context, stroke);
          context.beginPath();
          stroke.points.forEach(function drawPoint(point, index) {
            const x = clampNumber(getPointValue(point, "x", 0), 0, 1) * width;
            const y = clampNumber(getPointValue(point, "y", 1), 0, 1) * height;
            if (index === 0) {
              context.moveTo(x, y);
            } else {
              context.lineTo(x, y);
            }
          });
          context.stroke();
          context.closePath();
          context.restore();
        });
      }

      function replayPageAnnotations(pageNumber, inkCanvas, highlightCanvas, ratio) {
        const inkContext = inkCanvas.getContext("2d");
        const highlightContext = highlightCanvas.getContext("2d");
        const width = inkCanvas.clientWidth || inkCanvas.width / ratio;
        const height = inkCanvas.clientHeight || inkCanvas.height / ratio;

        clearCanvas(inkCanvas, inkContext);
        clearCanvas(highlightCanvas, highlightContext);
        inkContext.setTransform(ratio, 0, 0, ratio, 0, 0);
        highlightContext.setTransform(ratio, 0, 0, ratio, 0, 0);

        annotationStrokes
          .filter(function pageStroke(stroke) {
            return Number(stroke && stroke.page) === pageNumber;
          })
          .forEach(function replayStroke(stroke) {
            drawAnnotationStroke(stroke, inkContext, highlightContext, width, height);
          });
      }

      function createPageLoading() {
        const loading = document.createElement("div");
        loading.className = "page-loading";
        loading.textContent = "페이지를 여는 중입니다.";
        return loading;
      }

      function cleanupDistantPages() {
        const viewportTop = viewer.scrollTop;
        const viewportBottom = viewportTop + viewer.clientHeight;
        const keepDistance = Math.max(viewer.clientHeight * 3, 1800);

        Array.from(document.querySelectorAll(".page-block")).forEach(function cleanupPageBlock(pageBlock) {
          const blockTop = pageBlock.offsetTop;
          const blockBottom = blockTop + pageBlock.offsetHeight;
          const isFarAway = blockBottom < viewportTop - keepDistance || blockTop > viewportBottom + keepDistance;

          if (!isFarAway || pageBlock.dataset.renderState !== "rendered") return;

          const card = pageBlock.querySelector(".page-card");
          if (!card) return;

          card.replaceChildren(createPageLoading());
          pageBlock.dataset.renderState = "idle";
        });
      }

      function schedulePageCleanup() {
        window.clearTimeout(cleanupTimer);
        cleanupTimer = window.setTimeout(cleanupDistantPages, 260);
      }

      async function renderPageBlock(pageBlock) {
        if (!pdfDocument || !pageBlock || pageBlock.dataset.renderState === "rendered" || pageBlock.dataset.renderState === "rendering") {
          return;
        }

        const token = renderToken;
        const pageNumber = Number(pageBlock.dataset.page);
        const displayScale = Number(pageBlock.dataset.scale) || 1;
        const card = pageBlock.querySelector(".page-card");

        if (!pageNumber || !card) return;

        pageBlock.dataset.renderState = "rendering";

        try {
          const page = await pdfDocument.getPage(pageNumber);
          if (token !== renderToken) return;

          const displayViewport = page.getViewport({ scale: displayScale });
          const ratio = window.devicePixelRatio || 1;
          const canvas = document.createElement("canvas");
          canvas.className = "pdf-canvas";
          canvas.width = Math.floor(displayViewport.width * ratio);
          canvas.height = Math.floor(displayViewport.height * ratio);
          canvas.style.width = displayViewport.width + "px";
          canvas.style.height = displayViewport.height + "px";

          function createOverlayCanvas(className) {
            const overlayCanvas = document.createElement("canvas");
            overlayCanvas.className = className;
            overlayCanvas.width = canvas.width;
            overlayCanvas.height = canvas.height;
            overlayCanvas.style.width = canvas.style.width;
            overlayCanvas.style.height = canvas.style.height;
            return overlayCanvas;
          }

          const highlightCanvas = createOverlayCanvas("highlight-canvas");
          const inkCanvas = createOverlayCanvas("ink-canvas");
          const context = canvas.getContext("2d", { alpha: false });
          context.setTransform(ratio, 0, 0, ratio, 0, 0);
          card.replaceChildren(canvas, highlightCanvas, inkCanvas);

          await page.render({ canvasContext: context, viewport: displayViewport }).promise;
          if (token !== renderToken) return;

          replayPageAnnotations(pageNumber, inkCanvas, highlightCanvas, ratio);
          pageBlock.dataset.renderState = "rendered";
        } catch (error) {
          pageBlock.dataset.renderState = "idle";
        }
      }

      function renderVisiblePages() {
        const viewportTop = viewer.scrollTop;
        const viewportBottom = viewportTop + viewer.clientHeight;
        const preloadDistance = Math.max(viewer.clientHeight * 1.8, 1000);

        Array.from(document.querySelectorAll(".page-block")).forEach(function renderNearPage(pageBlock) {
          const blockTop = pageBlock.offsetTop;
          const blockBottom = blockTop + pageBlock.offsetHeight;
          const isNear = blockBottom >= viewportTop - preloadDistance && blockTop <= viewportBottom + preloadDistance;

          if (isNear) {
            renderPageBlock(pageBlock);
          }
        });
      }

      async function renderPdf() {
        if (!window.pdfjsLib) {
          showStatus("PDF 렌더러를 불러오지 못했습니다.");
          return;
        }

        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        try {
          const currentRenderToken = renderToken + 1;
          renderToken = currentRenderToken;
          const pdf = pdfDocument || (await window.pdfjsLib.getDocument({ url: PDF_URL, withCredentials: false }).promise);
          pdfDocument = pdf;
          const fragment = document.createDocumentFragment();
          const layoutWidth = getLayoutWidth();
          const pageBlocks = [];

          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            if (currentRenderToken !== renderToken) return;

            const page = await pdf.getPage(pageNumber);
            const baseViewport = page.getViewport({ scale: 1 });
            const availableWidth = Math.max(Math.min(layoutWidth - 28, 980), 240);
            const displayScale = availableWidth / baseViewport.width;
            const displayViewport = page.getViewport({ scale: displayScale });
            const ratio = window.devicePixelRatio || 1;

            const pageBlock = document.createElement("section");
            pageBlock.className = "page-block";
            pageBlock.dataset.page = String(pageNumber);
            pageBlock.dataset.renderState = "idle";
            pageBlock.dataset.scale = String(displayScale);

            const label = document.createElement("div");
            label.className = "page-label";
            label.textContent = pageNumber + " / " + pdf.numPages;

            const card = document.createElement("div");
            card.className = "page-card";
            card.style.width = displayViewport.width + "px";
            card.style.height = displayViewport.height + "px";
            card.appendChild(createPageLoading());
            pageBlock.appendChild(label);
            pageBlock.appendChild(card);
            fragment.appendChild(pageBlock);
            pageBlocks.push(pageBlock);
          }

          if (currentRenderToken !== renderToken) return;

          if (pageObserver) {
            pageObserver.disconnect();
          }

          viewer.replaceChildren(fragment);
          pageObserver = new IntersectionObserver(function onPageIntersection(entries) {
            entries.forEach(function renderIntersectingPage(entry) {
              if (entry.isIntersecting) {
                renderPageBlock(entry.target);
              }
            });
            schedulePageCleanup();
          }, {
            root: viewer,
            rootMargin: "1000px 0px",
            threshold: 0.01
          });
          pageBlocks.forEach(function observePageBlock(pageBlock) {
            pageObserver.observe(pageBlock);
          });
          hasRenderedPdf = true;
          lastLayoutWidth = layoutWidth;
          window.requestAnimationFrame(renderVisiblePages);
        } catch (error) {
          if (!hasRenderedPdf) {
            showStatus("PDF를 표시할 수 없습니다.");
          }
        }
      }

      function scheduleResponsiveRender() {
        const nextLayoutWidth = getLayoutWidth();

        if (hasRenderedPdf && Math.abs(nextLayoutWidth - lastLayoutWidth) < 18) {
          return;
        }

        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function rerenderPdf() {
          renderPdf();
        }, 180);
      }

      viewer.addEventListener("scroll", schedulePageCleanup, { passive: true });
      window.addEventListener("orientationchange", scheduleResponsiveRender);

      renderPdf();
    </script>
  </body>
</html>`;
}
