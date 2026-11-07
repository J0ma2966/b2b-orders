import L from "leaflet";

// Карты на Leaflet без react-leaflet. Next.js сохраняет открытые раньше страницы скрытыми
// (React Activity): при уходе со страницы эффекты снимаются, при возврате — запускаются снова.
// react-leaflet держит в состоянии уже удалённую карту и падает при возврате
// («Map container is being reused by another instance»), поэтому карта создаётся в эффекте
// и удаляется в его очистке: при каждом показе страницы — новая карта в том же блоке.

export const TASHKENT: L.LatLngTuple = [41.3111, 69.2797];

export function createMap(node: HTMLElement, center: L.LatLngExpression, zoom: number) {
  const map = L.map(node, { scrollWheelZoom: true }).setView(center, zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  return map;
}
