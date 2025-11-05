
(function forceLocalLeafletIcons() {
  try {
    const iconsBase = '/icons';
    const iconUrl = `${iconsBase}/marker-icon.png`;
    const icon2xUrl = `${iconsBase}/marker-icon-2x.png`;
    const shadowUrl = `${iconsBase}/marker-shadow.png`;

    if (window.L && L.Icon && L.Icon.Default && typeof L.Icon.Default.mergeOptions === 'function') {
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: icon2xUrl,
        iconUrl: iconUrl,
        shadowUrl: shadowUrl
      });
    }

    if (window.L && L.Icon && L.Icon.Default && L.Icon.Default.prototype) {
      L.Icon.Default.prototype.options.iconUrl = iconUrl;
      L.Icon.Default.prototype.options.iconRetinaUrl = icon2xUrl;
      L.Icon.Default.prototype.options.shadowUrl = shadowUrl;
    }

    window._LAKBY_LEAFLET_ICONS_FORCED = window._LAKBY_LEAFLET_ICONS_FORCED || { iconUrl, icon2xUrl, shadowUrl };
    console.info('[LeafletIcons] forced local icons:', iconUrl);
  } catch (e) {
    console.warn('[LeafletIcons] forcing failed', e);
  }
})();