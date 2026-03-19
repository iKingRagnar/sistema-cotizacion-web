/**
 * White-label y valores por defecto del cliente.
 * El servidor puede sobreescribir con GET /api/config (nombre, colores, logo, auth).
 */
window.__APP_CONFIG__ = {
  appName: 'Sistema de Cotización y Gestión',
  shortName: 'Cotización Pro',
  tagline: 'Cotizaciones, incidentes, bitácora de horas y catálogos en una sola plataforma',
  /** URL absoluta o relativa a la raíz del sitio; vacío = favicon por defecto */
  logoUrl: '',
  primaryHex: '#1e3a5f',
  accentHex: '#0d9488',
  /** Sonido suave al guardar con éxito (solo si el usuario lo activa en la UI) */
  soundEffectsDefault: false,
};
