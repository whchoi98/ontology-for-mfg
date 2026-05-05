export type Persona = "buyer" | "engineer" | "quality" | "scm" | "plant";
export type Division = "HA" | "HE" | "VS" | "INNOTEK" | "MAGNA";

export interface Component {
  id: string; name: string; category: string;
  standards: string[]; substances: string[];
}

export interface Supplier {
  id: string; name: string; region: string;
  rfm_recency: number; rfm_frequency: number; rfm_monetary: number;
}

export interface TradeLane {
  id: string; origin_region: string; dest_region: string;
  mode: "SEA" | "AIR" | "RAIL" | "ROAD";
  transit_days: number; regulations: string[];
}

export interface CytoscapeGraph {
  nodes: { data: { id: string; label?: string; [k: string]: unknown } }[];
  edges: { data: { id: string; source: string; target: string; type?: string } }[];
}
