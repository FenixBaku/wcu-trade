export default function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'w-11 h-11' : size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';
  const title = size === 'lg' ? 'text-2xl' : 'text-base';
  return (
    <div className="flex items-center gap-3">
      <div className={`${dims} rounded-md grid place-items-center relative overflow-hidden`} style={{ background: 'linear-gradient(135deg, #2D6BFF, #1E4CBF)' }}>
        <svg viewBox="0 0 24 24" className="w-2/3 h-2/3" fill="none">
          <path d="M3 17l5-6 4 3 6-8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="20" cy="6" r="1.6" fill="#22D3EE" />
        </svg>
      </div>
      <div className="leading-none">
        <div className={`font-bold tracking-tight ${title}`}>
          WCU <span className="text-wcu-bright">TRADE</span>
        </div>
        {size === 'lg' && <div className="text-2xs text-txt-faint mt-1 tracking-wide">Financial Markets Simulation Platform</div>}
      </div>
    </div>
  );
}
