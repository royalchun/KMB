export type Operator = 'ctb' | 'kmb';
export type Direction = 'outbound' | 'inbound';
export interface Selection { operator: Operator; route: string; direction: Direction; serviceType: string }
export interface Stop { id: string; seq: number; name: string; nameTc: string; lat: number; lng: number }
export interface Route extends Selection { origin: string; destination: string; stops: Stop[]; snapshot?: boolean }
export interface Arrival { eta: string; remark: string }
export interface StopEtas { stopId: string; seq: number; arrivals: Arrival[]; generatedAt: string; error?: string }
export interface Feed { stops: StopEtas[]; fetchedAt: string; partial: boolean }
export interface BusEstimate { id: string; lng: number; lat: number; nextStop: Stop; seconds: number; progress: number; segment: number; confidence: 'low' | 'medium' }
