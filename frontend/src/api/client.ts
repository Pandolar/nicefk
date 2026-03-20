import axios from 'axios';
import type { ApiResponse } from '../types';

export const api = axios.create({
  baseURL: '/',
  timeout: 10000
});

export function authHeaders(token: string | null) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as { detail?: string } | undefined)?.detail ?? fallback;
  }
  return fallback;
}

export async function unwrap<T>(request: Promise<{ data: ApiResponse<T> }>) {
  const response = await request;
  return response.data.data;
}
