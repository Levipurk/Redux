export interface ImageRecord {
  id: string;
  filename: string;
  originalUrl: string;
  publicId: string;
  width: number;
  height: number;
  size: number;
  format: string;
  createdAt: string;
  userId: string;
}

export interface ImageGroup {
  label: string;
  images: ImageRecord[];
}
