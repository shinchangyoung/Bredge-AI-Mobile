import { type PdfAnnotationPayload } from '@/lib/pdf-annotations';

export function createPdfViewerHtml(pdfBase64: string, annotations: PdfAnnotationPayload) {
  const annotationsJson = JSON.stringify(annotations).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      * {
        -webkit-tap-highlight-color: transparent;
        -webkit-touch-callout: none;
        -webkit-user-drag: none;
        -webkit-user-select: none;
        box-sizing: border-box;
        user-select: none;
      }

      ::selection {
        background: transparent;
      }

      html,
      body {
        background: #ffffff;
        color: #1d1d1f;
        font-family: -apple-system, BlinkMacSystemFont, "Pretendard", "Apple SD Gothic Neo", sans-serif;
        height: 100%;
        margin: 0;
        min-height: 100%;
        overflow: hidden;
        overscroll-behavior: none;
        touch-action: pan-x;
        -webkit-overflow-scrolling: touch;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
      }

      #viewer {
        display: flex;
        height: 100vh;
        overflow-x: auto;
        overflow-y: hidden;
        padding: 0;
        scroll-behavior: smooth;
        scroll-snap-type: x mandatory;
        touch-action: pan-x;
        -webkit-touch-callout: none;
        -webkit-overflow-scrolling: touch;
        -webkit-user-select: none;
        user-select: none;
        width: 100vw;
      }

      #viewer::-webkit-scrollbar { display: none; }

      .status {
        align-items: center;
        color: #8e929a;
        display: flex;
        font-size: 15px;
        font-weight: 800;
        height: 240px;
        justify-content: center;
      }

      .page-block {
        flex: 0 0 100vw;
        height: 100vh;
        margin: 0;
        padding: 0 0 10px;
        scroll-snap-align: start;
        scroll-snap-stop: always;
      }

      .page-label {
        color: #93a0b3;
        font-size: 12px;
        font-weight: 900;
        height: 30px;
        letter-spacing: 0;
        line-height: 30px;
        margin: 0 0 0 1px;
      }

      .page-card {
        background: #ffffff;
        border: 1px solid #e5ebf3;
        border-radius: 28px;
        margin-top: 18px;
        overflow: hidden;
        position: relative;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
        width: 100%;
      }

      .page-block.is-evidence-target .page-card {
        border-color: #3b82f6;
        box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.14);
      }

      .evidence-banner {
        align-items: center;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        border-radius: 999px;
        color: #1d4ed8;
        display: inline-flex;
        font-size: 12px;
        font-weight: 900;
        gap: 8px;
        left: 16px;
        padding: 7px 12px;
        position: absolute;
        top: 16px;
        z-index: 8;
      }

      .pdf-canvas {
        display: block;
        pointer-events: none;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
        width: 100%;
      }

      .highlight-canvas,
      .ink-canvas,
      .input-canvas {
        height: 100%;
        left: 0;
        pointer-events: none;
        position: absolute;
        top: 0;
        width: 100%;
      }

      .highlight-canvas { mix-blend-mode: multiply; }
      .input-canvas { touch-action: pan-x; }

      body.pen-mode .input-canvas { pointer-events: auto; }

      html.drawing-lock,
      body.drawing-lock {
        overflow: hidden;
        touch-action: none;
      }

      body.drawing-lock .input-canvas {
        touch-action: none;
      }
    </style>
  </head>
  <body>
    <div id="viewer">
      <div class="status">PDF를 여는 중입니다.</div>
    </div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <script>
      const PDF_BASE64 = "${pdfBase64}";
      const ANNOTATION_PAYLOAD = ${annotationsJson};
      const viewer = document.getElementById("viewer");
      let drawTool = { color: "#1F78FF", mode: "pen", type: "pen", width: 3.2 };
      let penMode = false;
      let pdfDocument = null;
      let renderToken = 0;
      let resizeTimer = null;
      let annotationStrokes = Array.isArray(ANNOTATION_PAYLOAD && ANNOTATION_PAYLOAD.strokes)
        ? ANNOTATION_PAYLOAD.strokes
        : [];

      ["contextmenu", "selectstart", "dragstart"].forEach(function blockNativeSelection(eventName) {
        document.addEventListener(eventName, function preventNativeSelection(event) {
          event.preventDefault();
        }, { capture: true });
      });

      window.setPenMode = function setPenMode(active) {
        penMode = Boolean(active);
        document.body.classList.toggle("pen-mode", penMode);
      };

      window.setDrawTool = function setDrawTool(nextTool) {
        drawTool = Object.assign({}, drawTool, nextTool || {});
      };

      window.scrollPdfPage = function scrollPdfPage(direction) {
        const pageBlocks = Array.from(document.querySelectorAll(".page-block"));
        if (!pageBlocks.length) return;

        const viewportAnchor = viewer.scrollLeft + viewer.clientWidth * 0.5;
        let currentIndex = 0;
        let closestDistance = Infinity;

        pageBlocks.forEach(function findCurrentPage(block, index) {
          const blockLeft = block.offsetLeft;
          const blockRight = blockLeft + block.offsetWidth;
          const distance =
            viewportAnchor >= blockLeft && viewportAnchor <= blockRight
              ? 0
              : Math.min(Math.abs(viewportAnchor - blockLeft), Math.abs(viewportAnchor - blockRight));

          if (distance < closestDistance) {
            closestDistance = distance;
            currentIndex = index;
          }
        });

        const targetIndex = direction === "previous"
          ? Math.max(0, currentIndex - 1)
          : Math.min(pageBlocks.length - 1, currentIndex + 1);
        const targetBlock = pageBlocks[targetIndex];

        viewer.scrollTo({
          behavior: "smooth",
          left: targetBlock.offsetLeft
        });
      };

      window.scrollPdfToPage = function scrollPdfToPage(pageNumber) {
        const pageBlocks = Array.from(document.querySelectorAll(".page-block"));
        if (!pageBlocks.length) return;

        const targetIndex = Math.min(Math.max(Number(pageNumber || 1), 1), pageBlocks.length) - 1;
        const targetBlock = pageBlocks[targetIndex];
        if (!targetBlock) return;

        pageBlocks.forEach(function clearEvidence(block) {
          block.classList.remove("is-evidence-target");
          const oldBanner = block.querySelector(".evidence-banner");
          if (oldBanner) oldBanner.remove();
        });

        targetBlock.classList.add("is-evidence-target");
        const card = targetBlock.querySelector(".page-card");
        if (card) {
          const banner = document.createElement("div");
          banner.className = "evidence-banner";
          banner.textContent = "AI가 참조한 PDF 페이지 · p." + (targetIndex + 1);
          card.prepend(banner);
        }

        viewer.scrollTo({
          behavior: "smooth",
          left: targetBlock.offsetLeft
        });
      };

      function showError(message) {
        viewer.innerHTML = '<div class="status">' + message + '</div>';
      }

      function getPdfBytes() {
        const binary = window.atob(PDF_BASE64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        return bytes;
      }

      function clampNumber(value, min, max) {
        return Math.min(max, Math.max(min, Number(value) || 0));
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

      function clearAnnotationCanvas(canvas, context) {
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
            const x = clampNumber(point.x, 0, 1) * width;
            const y = clampNumber(point.y, 0, 1) * height;
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

      function replayPageAnnotations(pageNumber, inkCanvas, highlightCanvas) {
        const inkContext = inkCanvas.getContext("2d");
        const highlightContext = highlightCanvas.getContext("2d");
        const width = inkCanvas.clientWidth || inkCanvas.width;
        const height = inkCanvas.clientHeight || inkCanvas.height;

        clearAnnotationCanvas(inkCanvas, inkContext);
        clearAnnotationCanvas(highlightCanvas, highlightContext);

        annotationStrokes
          .filter(function pageStroke(stroke) {
            return Number(stroke.page) === pageNumber;
          })
          .forEach(function replayStroke(stroke) {
            drawAnnotationStroke(stroke, inkContext, highlightContext, width, height);
          });
      }

      function bindDrawing(pageNumber, inputCanvas, inkCanvas, highlightCanvas) {
        const inkContext = inkCanvas.getContext("2d");
        const highlightContext = highlightCanvas.getContext("2d");
        const ratio = window.devicePixelRatio || 1;
        let isDrawing = false;
        let activeContexts = [];
        let activePointerId = null;
        let currentStroke = null;

        [inkContext, highlightContext].forEach(function prepareContext(context) {
          context.scale(ratio, ratio);
          context.lineCap = "round";
          context.lineJoin = "round";
        });

        function getToolWidth() {
          if (drawTool.mode === "eraser") return drawTool.width || 18;
          if (drawTool.type === "highlighter") return drawTool.width || 12;
          return drawTool.width || 3.2;
        }

        function configureContext(context) {
          context.globalCompositeOperation = drawTool.mode === "eraser" ? "destination-out" : "source-over";
          context.globalAlpha = drawTool.mode !== "eraser" && drawTool.type === "highlighter" ? 0.5 : 1;
          context.strokeStyle = drawTool.color || "#1F78FF";
          context.lineWidth = getToolWidth();
        }

        function applyDrawingStyle() {
          activeContexts =
            drawTool.mode === "eraser"
              ? [inkContext, highlightContext]
              : drawTool.type === "highlighter"
                ? [highlightContext]
                : [inkContext];

          activeContexts.forEach(configureContext);
        }

        function getPoint(event) {
          const rect = inputCanvas.getBoundingClientRect();
          return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
          };
        }

        function getNormalizedPoint(point) {
          const width = inputCanvas.clientWidth || 1;
          const height = inputCanvas.clientHeight || 1;
          return {
            x: clampNumber(point.x / width, 0, 1),
            y: clampNumber(point.y / height, 0, 1)
          };
        }

        function appendStrokePoint(point) {
          if (!currentStroke) return;

          const normalizedPoint = getNormalizedPoint(point);
          const lastPoint = currentStroke.points[currentStroke.points.length - 1];
          const width = inputCanvas.clientWidth || 1;
          const height = inputCanvas.clientHeight || 1;
          const distance = lastPoint
            ? Math.hypot((normalizedPoint.x - lastPoint.x) * width, (normalizedPoint.y - lastPoint.y) * height)
            : Infinity;

          if (distance >= 1.4) {
            currentStroke.points.push(normalizedPoint);
          }
        }

        function isDrawingPointer(event) {
          return event && event.pointerType === "pen";
        }

        function setDrawingScrollLock(locked) {
          document.documentElement.classList.toggle("drawing-lock", locked);
          document.body.classList.toggle("drawing-lock", locked);
        }

        function getEventTouches(event) {
          const touches = event.changedTouches && event.changedTouches.length
            ? event.changedTouches
            : event.touches;
          return Array.prototype.slice.call(touches || []);
        }

        function isStylusTouchEvent(event) {
          return getEventTouches(event).some(function isStylusTouch(touch) {
            return touch && (touch.touchType === "stylus" || touch.touchType === "pencil");
          });
        }

        inputCanvas.addEventListener("pointerdown", function onPointerDown(event) {
          if (!penMode || !isDrawingPointer(event)) return;

          event.preventDefault();
          setDrawingScrollLock(true);
          window.ReactNativeWebView?.postMessage("pdf-canvas-pointerdown");
          inputCanvas.setPointerCapture(event.pointerId);
          const point = getPoint(event);
          isDrawing = true;
          activePointerId = event.pointerId;
          currentStroke = {
            color: drawTool.color || "#1F78FF",
            createdAt: new Date().toISOString(),
            id: "stroke-" + Date.now() + "-" + Math.random().toString(36).slice(2),
            mode: drawTool.mode === "eraser" ? "eraser" : "pen",
            page: pageNumber,
            points: [],
            type: drawTool.type === "highlighter" ? "highlighter" : "pen",
            width: getToolWidth()
          };
          appendStrokePoint(point);
          applyDrawingStyle();
          activeContexts.forEach(function beginContextStroke(context) {
            context.beginPath();
            context.moveTo(point.x, point.y);
          });
        });

        inputCanvas.addEventListener("pointermove", function onPointerMove(event) {
          if (!isDrawing || !penMode || event.pointerId !== activePointerId) return;

          event.preventDefault();
          const point = getPoint(event);
          appendStrokePoint(point);
          activeContexts.forEach(function drawContextStroke(context) {
            context.lineTo(point.x, point.y);
            context.stroke();
          });
        });

        function stopDrawing(event) {
          if (activePointerId !== null && event?.pointerId !== undefined && event.pointerId !== activePointerId) return;
          if (!isDrawing) return;

          isDrawing = false;
          if (currentStroke && currentStroke.points.length) {
            annotationStrokes.push(currentStroke);
            window.ReactNativeWebView?.postMessage(JSON.stringify({
              stroke: currentStroke,
              type: "pdf-annotation-stroke"
            }));
          }
          currentStroke = null;
          activeContexts.forEach(function closeContextStroke(context) {
            context.closePath();
          });
          activeContexts = [];
          activePointerId = null;
          setDrawingScrollLock(false);
          if (event?.pointerId !== undefined && inputCanvas.hasPointerCapture(event.pointerId)) {
            inputCanvas.releasePointerCapture(event.pointerId);
          }
        }

        inputCanvas.addEventListener("pointerup", stopDrawing);
        inputCanvas.addEventListener("pointercancel", stopDrawing);
        inputCanvas.addEventListener("pointerleave", stopDrawing);
        ["touchstart", "touchmove", "gesturestart", "gesturechange"].forEach(function blockStylusNativeScroll(eventName) {
          inputCanvas.addEventListener(eventName, function preventStylusNativeScroll(event) {
            if (!penMode) return;
            if (isDrawing || isStylusTouchEvent(event) || eventName.indexOf("gesture") === 0) {
              event.preventDefault();
            }
          }, { passive: false });
        });
      }

      async function renderPdf() {
        if (!window.pdfjsLib) {
          showError("PDF 렌더러를 불러오지 못했습니다.");
          return;
        }

        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        try {
          const currentRenderToken = renderToken + 1;
          renderToken = currentRenderToken;
          const pdf = pdfDocument || (await window.pdfjsLib.getDocument({ data: getPdfBytes() }).promise);
          pdfDocument = pdf;
          viewer.innerHTML = "";

          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            if (currentRenderToken !== renderToken) return;

            const page = await pdf.getPage(pageNumber);
            const baseViewport = page.getViewport({ scale: 1 });
            const availableWidth = Math.max(window.innerWidth - 2, 240);
            const availableHeight = Math.max(window.innerHeight - 60, 240);
            const displayScale = Math.min(
              availableWidth / baseViewport.width,
              availableHeight / baseViewport.height
            );
            const displayViewport = page.getViewport({ scale: displayScale });
            const ratio = window.devicePixelRatio || 1;

            const pageBlock = document.createElement("section");
            pageBlock.className = "page-block";
            pageBlock.dataset.page = String(pageNumber);

            const label = document.createElement("div");
            label.className = "page-label";
            label.textContent = pageNumber + " / " + pdf.numPages;

            const card = document.createElement("div");
            card.className = "page-card";
            card.style.width = displayViewport.width + "px";
            card.style.height = displayViewport.height + "px";

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
            const inputCanvas = createOverlayCanvas("input-canvas");

            const context = canvas.getContext("2d", { alpha: false });
            context.setTransform(ratio, 0, 0, ratio, 0, 0);

            card.appendChild(canvas);
            card.appendChild(highlightCanvas);
            card.appendChild(inkCanvas);
            card.appendChild(inputCanvas);
            pageBlock.appendChild(label);
            pageBlock.appendChild(card);
            viewer.appendChild(pageBlock);

            await page.render({ canvasContext: context, viewport: displayViewport }).promise;
            bindDrawing(pageNumber, inputCanvas, inkCanvas, highlightCanvas);
            replayPageAnnotations(pageNumber, inkCanvas, highlightCanvas);
          }
        } catch (error) {
          showError("PDF를 표시할 수 없습니다.");
        }
      }

      function scheduleResponsiveRender() {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function rerenderPdf() {
          renderPdf();
        }, 160);
      }

      window.addEventListener("resize", scheduleResponsiveRender);
      window.addEventListener("orientationchange", scheduleResponsiveRender);

      renderPdf();
    </script>
  </body>
</html>`;
}
