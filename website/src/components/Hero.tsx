import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { TerminalSimulator } from "./TerminalSimulator";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Github } from "lucide-react";

export function Hero() {
    const { t } = useTranslation();

    return (
        <section className="relative w-full pt-10 pb-10 md:pt-12 md:pb-12 overflow-hidden flex flex-col items-center justify-center text-center px-4">
            {/* Top Navigation & Language Switcher */}
            <div className="absolute top-6 right-6 z-50">
                <LanguageSwitcher />
            </div>



            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                className="max-w-5xl mx-auto space-y-6"
            >
                {/* The "Witral" Branding - Massive & Premium Light */}
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                >
                    <h1 className="text-7xl md:text-[12rem] font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-slate-900 via-slate-800 to-slate-400 select-none pb-4 drop-shadow-sm">
                        Witral
                    </h1>
                </motion.div>



                <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight mx-auto max-w-4xl">
                    {t('hero.title')}
                </h2>

                <p className="text-lg md:text-2xl text-slate-600 max-w-3xl mx-auto leading-relaxed font-light">
                    {t('hero.subtitle')}
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-4">
                    <a
                        href="https://github.com/kirlts/witral"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative inline-flex items-center gap-3 px-8 py-4 bg-slate-900 text-white font-semibold rounded-2xl overflow-hidden transition-all active:scale-95 shadow-xl hover:shadow-2xl hover:shadow-slate-900/20"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <Github className="w-5 h-5 transition-transform group-hover:scale-110" />
                        <span className="text-lg">{t('hero.ctaSecondary')}</span>
                    </a>
                </div>
            </motion.div>

            {/* Showcase Terminal */}
            <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 1.2, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="w-full mt-10 max-w-6xl mx-auto"
            >
                <div className="relative group">
                    <TerminalSimulator />
                </div>
            </motion.div>
        </section>
    );
}
