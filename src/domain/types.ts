// ====================================================================
// ArtoCamello Marketplace — Domain Types
// ====================================================================

// --- Enums ---

export enum UserRole {
  CLIENT = 'client',
  PROFESSIONAL = 'pro',
  GUEST = 'guest',
}

export enum RequestStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  MATCHING = 'matching',
  CONTACT_LIMIT_OPEN = 'contact_limit_open',
  CONTACT_LIMIT_REACHED = 'contact_limit_reached',
  QUOTES_RECEIVED = 'quotes_received',
  HIRED = 'hired',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum LeadPurchaseStatus {
  PENDING = 'pending',   // Pago iniciado, pendiente de confirmación
  PAID = 'paid',         // Pago confirmado, contacto desbloqueado
  FAILED = 'failed',     // Pago fallido o caducado
}

export enum QuoteStatus {
  SENT = 'sent',
  VIEWED = 'viewed',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export enum UrgencyLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

// --- Entity Interfaces ---

export interface User {
  id: string;
  email: string;
  password: string; // hashed in real backend
  role: UserRole;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface ClientProfile {
  userId: string;
  addresses: string[];
  preferredCategories: string[];
}

export interface ProfessionalProfile {
  userId: string;
  businessName?: string;
  bio: string;
  categories: string[];       // slugs from ServiceCategory
  serviceZones: string[];     // city/area names
  experienceYears: number;
  portfolioImages: string[];
  rating: number;
  reviewCount: number;
  verified: boolean;
  completedJobs: number;
}

export interface ServiceCategory {
  id: string;
  slug: string;
  name: string;
  icon: string;             // lucide icon name
  description: string;
}

export interface ServiceRequest {
  id: string;
  clientId: string;
  categorySlug: string;
  title: string;
  description: string;
  location: string;
  urgency: UrgencyLevel;
  preferredDate?: string;
  status: RequestStatus;
  contactPhone: string;
  contactEmail: string;
  estimatedBudget: number;  // Presupuesto estimado del trabajo en USD
  costUSD?: number;         // Costo calculado por el backend (6% de estimatedBudget)
  maxProfessionalsPerLead?: number;
  purchaseCount: number;    // Cuántos pros compraron este lead (máx 4)
  createdAt: string;
  updatedAt: string;
}

export interface LeadPurchase {
  id: string;
  requestId: string;
  professionalId?: string;
  costUSD: number;                    // Costo en USD pagado al plataforma
  status: LeadPurchaseStatus;
  payphoneTransactionId?: string;     // ID de transacción en PayPhone
  purchasedAt: string;                // Fecha en que se pagó
}

export interface Quote {
  id: string;
  requestId: string;
  professionalId: string;
  message: string;
  estimatedPrice: number;
  estimatedDays?: number;
  status: QuoteStatus;
  createdAt: string;
}

export interface Review {
  id: string;
  requestId: string;
  clientId: string;
  professionalId: string;
  rating: number;            // 1-5
  comment: string;
  createdAt: string;
}

export interface PaymentHistoryItem {
  id: string;
  date: string;
  description: string;
  location: string;
  costUSD: number;
  payphoneTransactionId?: string;
  requestId: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  link: string;
  read: boolean;
  createdAt: string;
}

// --- Display Helpers ---

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  [RequestStatus.DRAFT]: 'Borrador',
  [RequestStatus.SUBMITTED]: 'Enviada',
  [RequestStatus.MATCHING]: 'Buscando profesionales',
  [RequestStatus.CONTACT_LIMIT_OPEN]: 'Recibiendo presupuestos',
  [RequestStatus.CONTACT_LIMIT_REACHED]: 'Límite de contactos alcanzado',
  [RequestStatus.QUOTES_RECEIVED]: 'Presupuestos recibidos',
  [RequestStatus.HIRED]: 'Profesional contratado',
  [RequestStatus.COMPLETED]: 'Completado',
  [RequestStatus.CANCELLED]: 'Cancelado',
};

export const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  [UrgencyLevel.LOW]: 'Baja - Fechas flexibles',
  [UrgencyLevel.MEDIUM]: 'Media - Próximos días',
  [UrgencyLevel.HIGH]: 'Alta - Lo antes posible',
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  [QuoteStatus.SENT]: 'Enviado',
  [QuoteStatus.VIEWED]: 'Visto',
  [QuoteStatus.ACCEPTED]: 'Aceptado',
  [QuoteStatus.REJECTED]: 'Rechazado',
};
