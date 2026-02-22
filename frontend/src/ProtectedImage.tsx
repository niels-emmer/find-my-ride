import { useEffect, useState } from 'react';

import { toAbsoluteApiPath } from './api';

interface ProtectedImageProps {
  token: string;
  path: string;
  alt: string;
}

export function ProtectedImage({ token, path, alt }: ProtectedImageProps): JSX.Element {
  const [src, setSrc] = useState<string>('');

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    void (async () => {
      try {
        const response = await fetch(toAbsoluteApiPath(path), {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (!response.ok) {
          return;
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (active) {
          setSrc(objectUrl);
        }
      } catch {
        // no-op
      }
    })();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [path, token]);

  if (!src) {
    return <div className="photo-placeholder">Loading image...</div>;
  }

  return <img className="photo-thumb" src={src} alt={alt} loading="lazy" />;
}
