function revealElement(element: HTMLElement) {
  element.dataset.revealState = "ready";
}

function waitForImage(image: HTMLImageElement): Promise<void> {
  const decodeImage = async () => {
    if (typeof image.decode !== "function") {
      return;
    }

    await image.decode().catch(() => undefined);
  };

  if (image.complete && image.naturalWidth > 0) {
    return decodeImage();
  }

  return new Promise((resolve) => {
    const settle = () => {
      image.removeEventListener("load", settle);
      image.removeEventListener("error", settle);
      decodeImage().then(resolve);
    };

    image.addEventListener("load", settle, { once: true });
    image.addEventListener("error", settle, { once: true });
  });
}

function getRevealImages(element: HTMLElement): HTMLImageElement[] {
  const images = Array.from(element.querySelectorAll("img"));

  if (element.dataset.imageReveal === "page") {
    return images;
  }

  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const firstViewportImages = images.filter((image) => {
    const rect = image.getBoundingClientRect();

    return rect.top < viewportHeight * 1.35 && rect.bottom > -80;
  });

  return firstViewportImages.length > 0 ? firstViewportImages : images.slice(0, 6);
}

function initializeImageReveal(element: HTMLElement) {
  const shouldRevealImmediately =
    !window.matchMedia("(min-width: 761px)").matches ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (shouldRevealImmediately) {
    revealElement(element);
    return;
  }

  requestAnimationFrame(() => {
    const images = getRevealImages(element);

    if (images.length === 0) {
      revealElement(element);
      return;
    }

    const timeout = new Promise<void>((resolve) => {
      window.setTimeout(resolve, 1100);
    });

    Promise.race([Promise.all(images.map(waitForImage)), timeout]).then(() => {
      revealElement(element);
    });
  });
}

document.querySelectorAll<HTMLElement>("[data-image-reveal]").forEach(initializeImageReveal);
