type LightboxItem = {
  index: number;
  category: string;
  categoryTitle: string;
  categoryHref: string;
  slug: string;
  href: string;
  src: string;
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
  let isTransitioning = false;
  const transitionMs = 180;

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
    previousButton.addEventListener("click", () => moveBy(-1));

    nextButton = document.createElement("button");
    nextButton.className = "lightbox-side lightbox-next";
    nextButton.type = "button";
    nextButton.setAttribute("aria-label", "Next photo");
    nextButton.innerHTML = nextIcon;
    nextButton.addEventListener("click", () => moveBy(1));

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

      moveBy(delta > 0 ? -1 : 1);
    });

    document.documentElement.classList.add("lightbox-open");
    document.body.classList.add("lightbox-open");
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

  function waitForFade(): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, transitionMs);
    });
  }

  async function waitForImageLoad(targetImage: HTMLImageElement): Promise<void> {
    if (targetImage.complete) {
      await targetImage.decode?.().catch(() => undefined);
      return;
    }

    await new Promise<void>((resolve) => {
      targetImage.addEventListener("load", () => resolve(), { once: true });
      targetImage.addEventListener("error", () => resolve(), { once: true });
    });

    await targetImage.decode?.().catch(() => undefined);
  }

  function prefersReducedMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  async function render(index: number, shouldPush: boolean): Promise<void> {
    const items = getCurrentItems();
    const item = items[index];

    if (!item || isTransitioning) {
      return;
    }

    const isFirstRender = !overlay;
    currentIndex = index;
    createOverlay();

    if (!image || !lightboxFigure) {
      return;
    }

    isTransitioning = true;
    const shouldAnimate = !prefersReducedMotion();

    if (shouldAnimate && !isFirstRender) {
      lightboxFigure.classList.add("photo-viewer-hidden");
      await waitForFade();
    }

    if (image) {
      image.src = item.src;
      image.width = item.width;
      image.height = item.height;
      image.alt = item.alt;
    }

    renderCaption(item);
    setButtonState();
    await waitForImageLoad(image);

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

    if (shouldAnimate) {
      requestAnimationFrame(() => {
        lightboxFigure?.classList.remove("photo-viewer-hidden");
      });
      await waitForFade();
    } else {
      lightboxFigure.classList.remove("photo-viewer-hidden");
    }

    isTransitioning = false;
  }

  function open(galleryId: string, index: number): void {
    if (!galleries.has(galleryId)) {
      return;
    }

    currentGalleryId = galleryId;
    historyDepth = 0;
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
    historyDepth = 0;
    isTransitioning = false;
    document.documentElement.classList.remove("lightbox-open");
    document.body.classList.remove("lightbox-open");

    if (previousFocus instanceof HTMLElement) {
      previousFocus.focus();
    }
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
    if (isTransitioning) {
      return;
    }

    const items = getCurrentItems();
    const nextIndex = currentIndex + delta;

    if (nextIndex < 0 || nextIndex >= items.length) {
      return;
    }

    void render(nextIndex, true);
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

    const galleryId = link.dataset.galleryId;
    const index = Number(link.dataset.photoIndex);

    if (!galleryId || Number.isNaN(index)) {
      return;
    }

    event.preventDefault();
    open(galleryId, index);
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
      moveBy(-1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveBy(1);
    }
  });

  window.addEventListener("popstate", (event) => {
    const state = event.state as LightboxState | null;

    if (state?.photoLightbox && galleries.has(state.galleryId)) {
      currentGalleryId = state.galleryId;
      historyDepth = state.depth;
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
