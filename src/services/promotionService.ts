import { apiClient } from '@/lib/apiClient';

/** Shape of a `promotion` object returned by the FastAPI backend (Admin view). */
export type BannerType = 'STANDARD' | 'IMAGE_ONLY';

interface BackendPromotion {
  id: string;
  tenant_id: string;
  banner_type: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  button_text: string | null;
  button_link: string | null;
  background_color: string | null;
  text_color: string | null;
  priority: number;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

/** Shape of the customer-facing home banner — lean, includes derived store branding. */
interface BackendCustomerBanner {
  id: string;
  banner_type: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  button_text: string | null;
  button_link: string | null;
  background_color: string | null;
  text_color: string | null;
  store_name: string | null;
  store_logo_url: string | null;
}

export interface AdminPromotion {
  id: string;
  bannerType: BannerType;
  title: string;
  subtitle: string;
  description: string;
  imageUrl: string;
  buttonText: string;
  buttonLink: string;
  backgroundColor: string;
  textColor: string;
  priority: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerBanner {
  id: string;
  bannerType: BannerType;
  title: string;
  subtitle: string;
  description: string;
  imageUrl: string;
  buttonText: string;
  buttonLink: string;
  backgroundColor: string;
  textColor: string;
  storeName: string;
  storeLogoUrl: string;
}

export interface PromotionFormData {
  bannerType?: BannerType;
  title: string;
  subtitle?: string;
  description?: string;
  imageUrl?: string;
  buttonText?: string;
  buttonLink?: string;
  backgroundColor?: string;
  textColor?: string;
  priority?: number;
  isActive?: boolean;
  startDate?: string | null;
  endDate?: string | null;
}

function mapAdminPromotion(raw: BackendPromotion): AdminPromotion {
  return {
    id: raw.id,
    bannerType: (raw.banner_type as BannerType) ?? 'STANDARD',
    title: raw.title,
    subtitle: raw.subtitle ?? '',
    description: raw.description ?? '',
    imageUrl: raw.image_url ?? '',
    buttonText: raw.button_text ?? '',
    buttonLink: raw.button_link ?? '',
    backgroundColor: raw.background_color ?? '',
    textColor: raw.text_color ?? '',
    priority: raw.priority,
    isActive: raw.is_active,
    startDate: raw.start_date,
    endDate: raw.end_date,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function mapCustomerBanner(raw: BackendCustomerBanner): CustomerBanner {
  return {
    id: raw.id,
    bannerType: (raw.banner_type as BannerType) ?? 'STANDARD',
    title: raw.title,
    subtitle: raw.subtitle ?? '',
    description: raw.description ?? '',
    imageUrl: raw.image_url ?? '',
    buttonText: raw.button_text ?? '',
    buttonLink: raw.button_link ?? '',
    backgroundColor: raw.background_color ?? '',
    textColor: raw.text_color ?? '',
    storeName: raw.store_name ?? '',
    storeLogoUrl: raw.store_logo_url ?? '',
  };
}

function toBackendPayload(data: Partial<PromotionFormData>) {
  return {
    ...(data.bannerType !== undefined && { banner_type: data.bannerType }),
    ...(data.title !== undefined && { title: data.title }),
    ...(data.subtitle !== undefined && { subtitle: data.subtitle }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.imageUrl !== undefined && { image_url: data.imageUrl }),
    ...(data.buttonText !== undefined && { button_text: data.buttonText }),
    ...(data.buttonLink !== undefined && { button_link: data.buttonLink }),
    ...(data.backgroundColor !== undefined && { background_color: data.backgroundColor }),
    ...(data.textColor !== undefined && { text_color: data.textColor }),
    ...(data.priority !== undefined && { priority: data.priority }),
    ...(data.isActive !== undefined && { is_active: data.isActive }),
    ...(data.startDate !== undefined && { start_date: data.startDate }),
    ...(data.endDate !== undefined && { end_date: data.endDate }),
  };
}

export const promotionService = {
  /** GET /api/v1/admin/promotions — all promotions for the admin's tenant, highest priority first. */
  async getAdminPromotions(): Promise<AdminPromotion[]> {
    const res = await apiClient.get<{ promotions: BackendPromotion[] }>('/admin/promotions', { auth: true });
    return res.data.promotions.map(mapAdminPromotion);
  },

  /** POST /api/v1/admin/promotions */
  async createPromotion(data: PromotionFormData): Promise<AdminPromotion> {
    const res = await apiClient.post<{ promotion: BackendPromotion }>('/admin/promotions', toBackendPayload(data), { auth: true });
    return mapAdminPromotion(res.data.promotion);
  },

  /** PUT /api/v1/admin/promotions/{id} — partial update. */
  async updatePromotion(id: string, data: Partial<PromotionFormData>): Promise<AdminPromotion> {
    const res = await apiClient.put<{ promotion: BackendPromotion }>(`/admin/promotions/${id}`, toBackendPayload(data), { auth: true });
    return mapAdminPromotion(res.data.promotion);
  },

  /** POST /api/v1/admin/promotions/{id}/image — uploads the banner image and
   * returns the promotion carrying the stored production URL. */
  async uploadPromotionImage(id: string, file: File): Promise<AdminPromotion> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post<{ promotion: BackendPromotion }>(
      `/admin/promotions/${id}/image`,
      formData,
      { auth: true }
    );
    return mapAdminPromotion(res.data.promotion);
  },

  /** DELETE /api/v1/admin/promotions/{id} — permanent delete. */
  async deletePromotion(id: string): Promise<void> {
    await apiClient.delete(`/admin/promotions/${id}`, { auth: true });
  },

  /** GET /api/v1/customer/home-banner — highest-priority active banner for the customer's tenant, or null. */
  async getHomeBanner(): Promise<CustomerBanner | null> {
    const res = await apiClient.get<{ banner: BackendCustomerBanner | null }>('/customer/home-banner', { auth: true });
    return res.data.banner ? mapCustomerBanner(res.data.banner) : null;
  },
};
