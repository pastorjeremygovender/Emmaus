import { motion } from 'framer-motion';

export const SPLASH_STORAGE_KEY = 'emmaus_splash_shown';
export const SPLASH_FADE_MS = 220;

export default function BrandedSplash({ fading = false }: { fading?: boolean }) {
  const baseUrl = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;

  return (
    <motion.div
      className="fixed inset-0 z-[100] min-h-[100dvh] flex flex-col items-center justify-center bg-white select-none"
      initial={{ opacity: 1 }}
      animate={{ opacity: fading ? 0 : 1 }}
      transition={{ duration: fading ? SPLASH_FADE_MS / 1000 : 0.28, ease: 'easeOut' }}
      role="status"
      aria-label="Emmaus is loading"
    >
      <div className="flex flex-col items-center gap-8">
        <img
          src={`${baseUrl}icon.png`}
          alt="Emmaus"
          draggable={false}
          className="h-[110px] w-[110px] object-contain"
        />
        <div className="flex flex-col items-center gap-2">
          <h1 className="font-sans text-[38px] font-semibold tracking-tight text-gray-900 leading-none">
            Emmaus
          </h1>
          <p className="font-sans text-[13px] font-medium tracking-wide text-gray-400">
            Isipingo Community Church
          </p>
        </div>
      </div>
    </motion.div>
  );
}