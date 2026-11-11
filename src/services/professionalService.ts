const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export interface PublicProfessional {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  createdAt: string;
  profile: {
    id: string;
    businessName: string | null;
    bio: string;
    categories: string[];
    serviceZones: string[];
    experienceYears: number;
    portfolioImages: string[];
    skills?: string[];
    city?: string;
    rating: number;
    reviewCount: number;
    verified: boolean;
    completedJobs: number;
  } | null;
  reviews?: Array<{
    id: string;
    rating: number;
    comment: string;
    createdAt: string;
    client: {
      fullName: string;
      avatarUrl: string | null;
    }
  }>;
}

export async function getMyProfessionalProfile(): Promise<{
  user: { fullName: string; phone: string | null; avatarUrl: string | null };
  profile: {
    businessName: string | null; bio: string; categories: string[]; experienceYears: number;
    skills: string[]; city: string | null; address: string | null; documentType: string | null;
    documentId: string | null; portfolioImages: string[];
  } | null;
}> {
  const { token } = getCurrentAuth();
  if (!token) throw new Error('Inicia sesión para cargar tu perfil.');
  const response = await fetch(`${API_URL}/profile`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo cargar tu perfil.');
  return data;
}

/**
 * Publicar una reseña
 */
export async function postReview(proId: string, rating: number, comment: string) {
  const { token } = getCurrentAuth();
  if (!token) throw new Error("Debes iniciar sesión para calificar.");

  const response = await fetch(`${API_URL}/professionals/${proId}/reviews`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ rating, comment }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Error al publicar la reseña');
  }
  return response.json();
}

/**
 * Obtener todos los profesionales públicos
 */
export async function getPublicProfessionals(): Promise<PublicProfessional[]> {
  const response = await fetch(`${API_URL}/professionals`);
  if (!response.ok) {
    throw new Error('Error al obtener la lista de profesionales');
  }
  return response.json();
}

/**
 * Obtener un profesional público por su ID
 */
export async function getProfessionalById(id: string): Promise<PublicProfessional> {
  const response = await fetch(`${API_URL}/professionals/${id}`);
  if (!response.ok) {
    throw new Error('Error al obtener el profesional');
  }
  return response.json();
}

import { getCurrentAuth } from './authService';

/**
 * Actualizar perfil del profesional autenticado
 */
export async function updateProfessionalProfile(
  data: {
    fullName?: string;
    avatarUrl?: string;
    businessName?: string;
    bio?: string;
    categories?: string[];
    experienceYears?: number;
    portfolioImages?: string[];
    skills?: string[];
    city?: string;
    address?: string;
    phone?: string;
    documentType?: string;
    documentId?: string;
  }
) {
  const { token } = getCurrentAuth();
  if (!token) throw new Error("No hay sesión activa");
  
  const response = await fetch(`${API_URL}/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Error al actualizar el perfil profesional');
  }
  return response.json();
}
