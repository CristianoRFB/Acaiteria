export function BrandLogo({
  compact = false,
  inverse = false,
}: {
  compact?: boolean;
  inverse?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <img
        src="/logo-acai-sabor.jpg"
        alt="Açaí + Sabor"
        className={`${compact ? 'size-9' : 'size-11'} rounded-full object-cover ring-2 ${inverse ? 'ring-white/20' : 'ring-[#82204f]/10'}`}
      />
      {!compact && (
        <span className={`text-base font-black tracking-[-0.03em] ${inverse ? 'text-white' : 'text-[#351924]'}`}>
          Açaí + Sabor
        </span>
      )}
    </span>
  );
}
