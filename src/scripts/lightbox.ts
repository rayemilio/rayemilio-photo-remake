type LightboxItem = {
  index: number;
  category: string;
  categoryTitle: string;
  categoryHref: string;
  slug: string;
  href: string;
  src: string;
  previewSrc: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  details: string;
};

type LightboxState = {
  photoLightbox: true;
  galleryId: string;
  index: number;
  depth: number;
};

type NavigatorConnection = {
  saveData?: boolean;
  effectiveType?: string;
};

type NavigatorWithConnection = Navigator & {
  connection?: NavigatorConnection;
};

const previousIcon = `
  <svg class="photo-arrow-icon" viewBox="0 0 44 81" aria-hidden="true">
    <path d="M42.076 80.362l1.285-1.284c.852-.85.852-2.23 0-3.081L7.835 40.5 43.36 5.003c.852-.85.852-2.23 0-3.081L42.076.638a2.182 2.182 0 00-3.084 0L.64 38.96a2.178 2.178 0 000 3.082l38.353 38.32a2.182 2.182 0 003.084 0z"></path>
  </svg>
`;

const nextIcon = `
  <svg class="photo-arrow-icon" viewBox="0 0 44 81" aria-hidden="true">
    <path d="M1.924.638L.639 1.922a2.178 2.178 0 000 3.081L36.165 40.5.64 75.997a2.178 2.178 0 000 3.081l1.285 1.284c.851.85 2.232.85 3.084 0L43.36 42.04a2.178 2.178 0 000-3.082L5.008.64a2.182 2.182 0 00-3.084 0z"></path>
  </svg>
`;

const closeIcon = `
  <svg class="photo-close-icon" viewBox="0 0 44 44" aria-hidden="true">
    <path d="M26.668 22L40.77 7.899l2.908-2.908a1.1 1.1 0 000-1.555L40.567.323a1.1 1.1 0 00-1.556 0l-17.01 17.01L4.99.323a1.1 1.1 0 00-1.555 0L.322 3.433a1.1 1.1 0 000 1.556L17.334 22 .322 39.01a1.1 1.1 0 000 1.556l3.111 3.111a1.1 1.1 0 001.556 0L22 26.668 36.103 40.77l2.908 2.908a1.1 1.1 0 001.556 0l3.111-3.111a1.1 1.1 0 000-1.556l-17.01-17.01z"></path>
  </svg>
`;

const runtimeWindow = window as Window & {
  __photoLightboxInitialized?: boolean;
};

if (!runtimeWindow.__photoLightboxInitialized) {
  runtimeWindow.__photoLightboxInitialized = true;

  const galleries = new Map<string, LightboxItem[]>();
  const dataNodes = document.querySelectorAll<HTMLScriptElement>("script[data-gallery-json]");

  dataNodes.forEach((node) => {
    const galleryId = node.dataset.galleryJson;

    if (!galleryId) {
      return;
    }

    galleries.set(galleryId, JSON.parse(node.textContent ?? "[]") as LightboxItem[]);
  });

  let overlay: HTMLDivElement | null = null;
  let image: HTMLImageElement | null = null;
  let lightboxFigure: HTMLElement | null = null;
  let caption: HTMLElement | null = null;
  let previousButton: HTMLButtonElement | null = null;
  let nextButton: HTMLButtonElement | null = null;
  let currentGalleryId = "";
  let currentIndex = 0;
  let historyDepth = 0;
  let pointerStartX: number | null = null;
  let previousFocus: Element | null = null;
  let shouldRestoreFocusOnClose = false;
  let targetIndex = 0;
  let renderToken = 0;
  let preloadRunId = 0;
  let previewPreloadRunId = 0;
  const loadedFullSrcs = new Set<string>();
  const loadedPreviewSrcs = new Set<string>();
  const previewLoadPromises = new Map<string, Promise<boolean>>();

  function getCurrentItems(): LightboxItem[] {
    return galleries.get(currentGalleryId) ?? [];
  }

  function getCurrentItem(): LightboxItem | undefined {
    return getCurrentItems()[currentIndex];
  }

  function createOverlay(): void {
    if (overlay) {
      return;
    }

    previousFocus = document.activeElement;
    overlay = document.createElement("div");
    overlay.className = "lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.tabIndex = -1;

    const close = document.createElement("button");
    close.className = "lightbox-close";
    close.type = "button";
    close.innerHTML = closeIcon;
    close.setAttribute("aria-label", "Close photo");
    close.addEventListener("click", closeFromButton);

    previousButton = document.createElement("button");
    previousButton.className = "lightbox-side lightbox-prev";
    previousButton.type = "button";
    previousButton.setAttribute("aria-label", "Previous photo");
    previousButton.innerHTML = previousIcon;
    previousButton.addEventListener("click", () => requestMoveBy(-1));

    nextButton = document.createElement("button");
    nextButton.className = "lightbox-side lightbox-next";
    nextButton.type = "button";
    nextButton.setAttribute("aria-label", "Next photo");
    nextButton.innerHTML = nextIcon;
    nextButton.addEventListener("click", () => requestMoveBy(1));

    lightboxFigure = document.createElement("figure");
    lightboxFigure.className = "lightbox-figure photo-viewer-hidden";

    const frame = document.createElement("div");
    frame.className = "lightbox-frame";

    image = document.createElement("img");
    image.className = "lightbox-image";
    image.decoding = "async";

    caption = document.createElement("figcaption");
    caption.className = "lightbox-caption";

    frame.append(image);
    lightboxFigure.append(frame, caption);
    overlay.append(close, previousButton, nextButton, lightboxFigure);
    document.body.append(overlay);

    overlay.addEventListener("pointerdown", (event) => {
      pointerStartX = event.clientX;
    });

    overlay.addEventListener("pointerup", (event) => {
      if (pointerStartX === null) {
        return;
      }

      const delta = event.clientX - pointerStartX;
      pointerStartX = null;

      if (Math.abs(delta) < 48) {
        return;
      }

      requestMoveBy(delta > 0 ? -1 : 1);
    });

    document.documentElement.classList.add("lightbox-open");
    document.body.classList.add("lightbox-open");
    window.addEventListener("resize", syncCurrentImageDisplayFrame);
    overlay.focus();
  }

  function renderCaption(item: LightboxItem): void {
    if (!caption) {
      return;
    }

    caption.replaceChildren();

    if (item.caption) {
      const captionText = document.createElement("span");
      captionText.textContent = item.caption;
      caption.append(captionText);
    }

    if (item.details) {
      const details = document.createElement("span");
      details.textContent = item.details;
      caption.append(details);
    }
  }

  function setButtonState(): void {
    const items = getCurrentItems();

    if (previousButton) {
      previousButton.hidden = currentIndex <= 0;
    }

    if (nextButton) {
      nextButton.hidden = currentIndex >= items.length - 1;
    }
  }

  function clampIndex(index: number, itemCount: number): number {
    return Math.min(Math.max(index, 0), Math.max(itemCount - 1, 0));
  }

  function waitForAnimationFrame(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  async function waitForCommittedImagePaint(src: string, token: number): Promise<boolean> {
    if (!image) {
      return false;
    }

    const targetImage = image;
    const expectedSrc = new URL(src, window.location.href).href;

    for (let frame = 0; frame < 120; frame += 1) {
      if (token !== renderToken || !image || image !== targetImage) {
        return false;
      }

      if (targetImage.currentSrc === expectedSrc && targetImage.complete && targetImage.naturalWidth > 0) {
        await targetImage.decode?.().catch(() => undefined);
        await waitForAnimationFrame();
        await waitForAnimationFrame();

        return token === renderToken && !!image && image === targetImage && targetImage.currentSrc === expectedSrc;
      }

      await waitForAnimationFrame();
    }

    return false;
  }

  function hideFigureImmediately(): void {
    if (!lightboxFigure) {
      return;
    }

    lightboxFigure.style.transition = "none";
    lightboxFigure.classList.add("photo-viewer-hidden");
    void lightboxFigure.offsetWidth;
    lightboxFigure.style.transition = "";
  }

  async function waitForImageLoad(targetImage: HTMLImageElement): Promise<boolean> {
    if (targetImage.complete) {
      await targetImage.decode?.().catch(() => undefined);
      return targetImage.naturalWidth > 0;
    }

    const loaded = await new Promise<boolean>((resolve) => {
      targetImage.addEventListener("load", () => resolve(true), { once: true });
      targetImage.addEventListener("error", () => resolve(false), { once: true });
    });

    await targetImage.decode?.().catch(() => undefined);
    return loaded && targetImage.naturalWidth > 0;
  }

  function prefersReducedMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function shouldWarmFullImages(): boolean {
    const connection = (navigator as NavigatorWithConnection).connection;

    if (connection?.saveData) {
      return false;
    }

    return connection?.effectiveType !== "slow-2g" && connection?.effectiveType !== "2g";
  }

  function setImageDisplayFrame(item: LightboxItem): void {
    if (!image) {
      return;
    }

    const aspectRatio = item.width / item.height;
    const maxWidth = Math.min(window.innerWidth, 2200, item.width);
    const maxHeight = Math.max(window.innerHeight - 72, 1);
    const displayWidth = Math.min(maxWidth, maxHeight * aspectRatio);
    const displayHeight = displayWidth / aspectRatio;

    image.style.aspectRatio = `${item.width} / ${item.height}`;
    image.style.width = `${displayWidth}px`;
    image.style.height = `${displayHeight}px`;
  }

  function syncCurrentImageDisplayFrame(): void {
    const item = getCurrentItem();

    if (!item) {
      return;
    }

    setImageDisplayFrame(item);
  }

  function createImageLoader(item: LightboxItem, src: string): HTMLImageElement {
    const nextImage = new Image();
    nextImage.decoding = "async";
    nextImage.width = item.width;
    nextImage.height = item.height;
    nextImage.alt = item.alt;
    nextImage.src = src;
    return nextImage;
  }

  function commitImage(item: LightboxItem, src: string): void {
    if (!image) {
      return;
    }

    image.width = item.width;
    image.height = item.height;
    image.alt = item.alt;
    setImageDisplayFrame(item);
    image.src = src;
  }

  async function prepareImageSource(item: LightboxItem, src: string): Promise<boolean> {
    return waitForImageLoad(createImageLoader(item, src));
  }

  async function preparePreviewImage(item: LightboxItem): Promise<boolean> {
    if (loadedPreviewSrcs.has(item.previewSrc)) {
      return true;
    }

    const existingLoad = previewLoadPromises.get(item.previewSrc);

    if (existingLoad) {
      return existingLoad;
    }

    const load = prepareImageSource(item, item.previewSrc).then((loaded) => {
      if (loaded) {
        loadedPreviewSrcs.add(item.previewSrc);
      } else {
        previewLoadPromises.delete(item.previewSrc);
      }

      return loaded;
    });

    previewLoadPromises.set(item.previewSrc, load);
    return load;
  }

  async function prepareFullImage(item: LightboxItem): Promise<boolean> {
    if (loadedFullSrcs.has(item.src)) {
      return true;
    }

    const loaded = await prepareImageSource(item, item.src);

    if (loaded) {
      loadedFullSrcs.add(item.src);
    }

    return loaded;
  }

  function getWarmQueueIndices(startIndex: number, itemCount: number): number[] {
    const indices: number[] = [];

    for (let offset = 1; offset < itemCount; offset += 1) {
      const nextIndex = startIndex + offset;
      const previousIndex = startIndex - offset;

      if (nextIndex < itemCount) {
        indices.push(nextIndex);
      }

      if (previousIndex >= 0) {
        indices.push(previousIndex);
      }
    }

    return indices;
  }

  function stopFullImageWarmQueue(): void {
    preloadRunId += 1;
  }

  function stopPreviewImageWarmQueue(): void {
    previewPreloadRunId += 1;
  }

  async function warmPreviewImagesFrom(startIndex: number, runId: number): Promise<void> {
    const items = getCurrentItems();
    const indices = [startIndex, ...getWarmQueueIndices(startIndex, items.length)];

    for (const index of indices) {
      if (runId !== previewPreloadRunId || !overlay) {
        return;
      }

      const item = items[index];

      if (!item || loadedPreviewSrcs.has(item.previewSrc)) {
        continue;
      }

      await preparePreviewImage(item);
    }
  }

  function startPreviewImageWarmQueue(startIndex: number): void {
    stopPreviewImageWarmQueue();

    const runId = previewPreloadRunId;
    void warmPreviewImagesFrom(startIndex, runId);
  }

  async function warmFullImagesFrom(startIndex: number, runId: number): Promise<void> {
    if (!shouldWarmFullImages()) {
      return;
    }

    const items = getCurrentItems();

    for (const index of getWarmQueueIndices(startIndex, items.length)) {
      if (runId !== preloadRunId || !overlay) {
        return;
      }

      const item = items[index];

      if (!item || loadedFullSrcs.has(item.src)) {
        continue;
      }

      await prepareFullImage(item);
    }
  }

  function startFullImageWarmQueue(startIndex: number): void {
    stopFullImageWarmQueue();

    const runId = preloadRunId;
    void warmFullImagesFrom(startIndex, runId);
  }

  async function promoteFullImage(item: LightboxItem, token: number): Promise<void> {
    if (!image || item.previewSrc === item.src) {
      return;
    }

    const loaded = await prepareFullImage(item);

    if (!loaded || token !== renderToken || !image || getCurrentItem()?.href !== item.href) {
      return;
    }

    image.src = item.src;
    startFullImageWarmQueue(currentIndex);
  }

  async function render(index: number, shouldPush: boolean): Promise<void> {
    const items = getCurrentItems();
    const item = items[index];

    if (!item) {
      return;
    }

    targetIndex = index;
    const isFirstRender = !overlay;
    createOverlay();

    if (!image || !lightboxFigure) {
      return;
    }

    stopFullImageWarmQueue();
    startPreviewImageWarmQueue(index);

    const token = renderToken + 1;
    renderToken = token;
    const shouldAnimate = !prefersReducedMotion();

    if (shouldAnimate && !isFirstRender) {
      hideFigureImmediately();
    }

    if (token !== renderToken || !overlay || !image || !lightboxFigure) {
      return;
    }

    let displaySrc = item.src;
    let fullReady = loadedFullSrcs.has(item.src);

    if (!fullReady) {
      const previewLoaded = await preparePreviewImage(item);

      if (token !== renderToken || !overlay || !image || !lightboxFigure) {
        return;
      }

      if (previewLoaded) {
        displaySrc = item.previewSrc;

        if (item.previewSrc === item.src) {
          loadedFullSrcs.add(item.src);
          fullReady = true;
        }
      } else if (item.previewSrc !== item.src) {
        const fullLoaded = await prepareFullImage(item);

        if (token !== renderToken || !overlay || !image || !lightboxFigure) {
          return;
        }

        if (!fullLoaded) {
          return;
        }

        displaySrc = item.src;
        fullReady = true;
      } else {
        return;
      }
    }

    if (token !== renderToken || !overlay || !image || !lightboxFigure) {
      return;
    }

    commitImage(item, displaySrc);
    renderCaption(item);

    const readyToReveal = await waitForCommittedImagePaint(displaySrc, token);

    if (!readyToReveal || token !== renderToken || !lightboxFigure) {
      return;
    }

    currentIndex = index;
    targetIndex = index;
    setButtonState();

    if (shouldPush) {
      historyDepth += 1;
      history.pushState(
        {
          photoLightbox: true,
          galleryId: currentGalleryId,
          index: currentIndex,
          depth: historyDepth
        } satisfies LightboxState,
        "",
        item.href
      );
    }

    lightboxFigure.classList.remove("photo-viewer-hidden");

    if (fullReady) {
      startFullImageWarmQueue(currentIndex);
    } else if (displaySrc !== item.src) {
      void promoteFullImage(item, token);
    }
  }

  function open(galleryId: string, index: number, restoreFocusOnClose = false): void {
    if (!galleries.has(galleryId)) {
      return;
    }

    currentGalleryId = galleryId;
    historyDepth = 0;
    shouldRestoreFocusOnClose = restoreFocusOnClose;
    void render(index, true);
  }

  function closeOverlay(): void {
    overlay?.remove();
    overlay = null;
    image = null;
    lightboxFigure = null;
    caption = null;
    previousButton = null;
    nextButton = null;
    pointerStartX = null;
    stopFullImageWarmQueue();
    stopPreviewImageWarmQueue();
    renderToken += 1;
    historyDepth = 0;
    document.documentElement.classList.remove("lightbox-open");
    document.body.classList.remove("lightbox-open");
    window.removeEventListener("resize", syncCurrentImageDisplayFrame);

    if (shouldRestoreFocusOnClose && previousFocus instanceof HTMLElement) {
      previousFocus.focus({ preventScroll: true });
    }

    previousFocus = null;
    shouldRestoreFocusOnClose = false;
  }

  function closeFromButton(): void {
    if (historyDepth > 0) {
      history.go(-historyDepth);
      closeOverlay();
      return;
    }

    closeOverlay();
  }

  function moveBy(delta: number): void {
    const items = getCurrentItems();

    if (items.length === 0) {
      return;
    }

    const nextIndex = clampIndex(targetIndex + delta, items.length);

    if (nextIndex === targetIndex) {
      return;
    }

    void render(nextIndex, true);
  }

  function requestMoveBy(delta: number): void {
    moveBy(delta);
  }

  function shouldUsePhotoPageOnThisDevice(): boolean {
    return window.matchMedia("(pointer: coarse), (hover: none), (max-width: 760px)").matches;
  }

  document.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const link = target.closest<HTMLAnchorElement>("a[data-lightbox-photo]");

    if (!link) {
      return;
    }

    if (shouldUsePhotoPageOnThisDevice()) {
      return;
    }

    const galleryId = link.dataset.galleryId;
    const index = Number(link.dataset.photoIndex);

    if (!galleryId || Number.isNaN(index)) {
      return;
    }

    event.preventDefault();
    open(galleryId, index, event instanceof MouseEvent && event.detail === 0);
  });

  document.addEventListener("keydown", (event) => {
    if (!overlay) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeFromButton();
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      requestMoveBy(-1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      requestMoveBy(1);
    }
  });

  window.addEventListener("popstate", (event) => {
    const state = event.state as LightboxState | null;

    if (state?.photoLightbox && galleries.has(state.galleryId)) {
      currentGalleryId = state.galleryId;
      historyDepth = state.depth;
      targetIndex = state.index;
      void render(state.index, false);
      return;
    }

    if (overlay) {
      closeOverlay();
    }
  });

  window.addEventListener("beforeunload", () => {
    const item = getCurrentItem();

    if (item && overlay) {
      history.replaceState(null, "", item.categoryHref);
    }
  });
}
