/** Claves de catálogo en BD (`catalogos.clave`). Usar en formularios para evitar texto libre. */
export const CATALOGO = {
  ROL: "rol",
  PUESTO: "puesto",
  DEPARTAMENTO: "departamento",
  PROFESION: "profesion",
  COTIZACION_TIPO: "cotizacion_tipo",
  COTIZACION_ESTADO: "cotizacion_estado",
} as const;

export type CatalogoClave = (typeof CATALOGO)[keyof typeof CATALOGO];

export const CATALOGO_LABELS: Record<string, string> = {
  [CATALOGO.ROL]: "Rol",
  [CATALOGO.PUESTO]: "Puesto",
  [CATALOGO.DEPARTAMENTO]: "Departamento",
  [CATALOGO.PROFESION]: "Profesión",
  [CATALOGO.COTIZACION_TIPO]: "Tipo de cotización",
  [CATALOGO.COTIZACION_ESTADO]: "Estado de cotización",
};
