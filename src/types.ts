export type Operator = 'ctb' | 'kmb';
export type Direction = 'outbound' | 'inbound';
export interface Selection { operator: Operator; route: string; direction: Direction; serviceType: string }
export interface Stop { id: string; seq: number; name: string; nameTc: string; lat: number; lng: number }
export type Coordinate = [number, number];
export interface RoadGeometry { segments: Coordinate[][]; source: string }
export interface Route extends Selection { origin: string; destination: string; stops: Stop[]; snapshot?: boolean; geometry?: RoadGeometry }
export interface Arrival { eta: string; remark: string }
export interface StopEtas { stopId: string; seq: number; arrivals: Arrival[]; generatedAt: string; error?: string }
export interface Feed { stops: StopEtas[]; fetchedAt: string; partial: boolean }
export interface BusEstimate { id: string; lng: number; lat: number; nextStop: Stop; seconds: number; progress: number; segment: number; confidence: 'low' | 'medium'; bearing?: number; estimatedDeparture?: string; anchorStop?: Stop; anchorEta?: string; travelSeconds?: number }
export interface RouteState { selection: Selection; route: Route | null; feed: Feed | null; loading: boolean; error: string; geometryError: boolean }
export interface MapRoute { key: string; route: Route; buses: BusEstimate[]; color: string }
