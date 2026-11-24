import { useState } from "react";
import { Building2 } from "lucide-react";

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}

export function SafeImage({ src, alt, className = "", fallbackTitle }: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-silver p-6 text-center text-muted-foreground ${className}`}
        role="img"
        aria-label={alt}
      >
        <Building2 className="h-8 w-8 opacity-60" aria-hidden="true" />
        {fallbackTitle && <p className="mt-2 text-xs font-medium">{fallbackTitle}</p>}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
