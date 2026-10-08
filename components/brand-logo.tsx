export function BrandLogo({
  compact = false,
  inverse = false,
  brandName = 'Estabelecimento',
  logoUrl = '',
  primaryColor = '#82204f',
}: {
  compact?: boolean;
  inverse?: boolean;
  brandName?: string;
  logoUrl?: string;
  primaryColor?: string;
}) {
  const resolvedLogoUrl = logoUrl;
  const initials = brandName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'L';
  return (
    <span className="flex items-center gap-2">
      {resolvedLogoUrl
        ? <img src={resolvedLogoUrl} alt={brandName} className={`${compact ? 'size-9' : 'size-11'} rounded-full object-cover ring-2 ${inverse ? 'ring-white/20' : ''}`} style={inverse ? undefined : { outline: `2px solid ${primaryColor}20` }} />
        : <span aria-label={brandName} className={`${compact ? 'size-9' : 'size-11'} grid place-items-center rounded-full text-xs font-black text-white`} style={{ backgroundColor: primaryColor }}>{initials}</span>}
      {!compact && (
        <span className={`text-base font-black tracking-[-0.03em] ${inverse ? 'text-white' : 'text-[#351924]'}`}>
          {brandName}
        </span>
      )}
    </span>
  );
}
