import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Database, Puzzle, Cloud } from "lucide-react";

export function Capabilities() {
    const { t } = useTranslation();

    const cards = [
        {
            id: "ingestion",
            icon: <Database className="w-8 h-8 text-blue-400" />,
            bg: "from-blue-500/10 to-transparent",
            image: `${import.meta.env.BASE_URL}images/image-interactive-menu-from-whatsapp.webp`
        },
        {
            id: "plugins",
            icon: <Puzzle className="w-8 h-8 text-purple-400" />,
            bg: "from-purple-500/10 to-transparent",
            image: `${import.meta.env.BASE_URL}images/image-tags-folder-in-obsidian.webp`
        },
        {
            id: "cloud",
            icon: <Cloud className="w-8 h-8 text-cyan-400" />,
            bg: "from-cyan-500/10 to-transparent",
            image: `${import.meta.env.BASE_URL}images/image-tags-folder-in-drive.webp`
        }
    ];

    return (
        <section className="relative w-full py-12 md:py-16 flex flex-col items-center justify-center px-4">
            <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1 }}
                className="text-center mb-10"
            >
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
                    {t('capabilities.title')}
                </h2>
                <p className="text-lg text-slate-600 max-w-2xl mx-auto font-light">
                    {t('capabilities.subtitle')}
                </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto w-full">
                {cards.map((card, i) => (
                    <motion.div
                        key={card.id}
                        custom={i}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: "-50px" }}
                        className="group relative rounded-3xl border border-slate-200 bg-white shadow-sm hover:shadow-md p-8 flex flex-col h-full transition-shadow duration-300"
                    >
                        {/* Glow and Background layer mapped behind */}
                        <div className={`absolute inset-0 rounded-3xl overflow-hidden bg-gradient-to-br ${card.bg} opacity-0 group-hover:opacity-10 transition-opacity duration-500 pointer-events-none`} />

                        <div className="relative z-10 flex flex-col h-full">
                            <div className="mb-6 p-4 rounded-2xl bg-slate-50 inline-block border border-slate-100 group-hover:scale-110 transition-transform mx-auto">
                                {card.icon}
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900 mb-4">
                                {t(`capabilities.cards.${card.id}.title`)}
                            </h3>
                            <p className="text-slate-600 leading-relaxed font-light mb-6 text-center flex-grow">
                                {t(`capabilities.cards.${card.id}.description`)}
                            </p>

                            {/* Image Preview with Hover Reveal */}
                            {card.image && (
                                <div className="mt-auto relative group/img w-full z-20">
                                    {/* Thumbnail */}
                                    <div className="w-full h-56 rounded-xl overflow-hidden shadow-sm transition-transform duration-300 bg-slate-100 border border-slate-200 flex items-start justify-center cursor-pointer">
                                        <img src={card.image} alt={t(`capabilities.cards.${card.id}.title`)} className="w-full h-full object-cover object-top opacity-90 group-hover/img:opacity-100 transition-opacity" loading="lazy" />
                                    </div>

                                    {/* Hover Pop-out Full Image */}
                                    <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[140%] min-w-[320px] pb-6 scale-90 opacity-0 pointer-events-none group-hover/img:scale-100 group-hover/img:opacity-100 group-hover/img:pointer-events-auto transition-all duration-300 origin-bottom drop-shadow-2xl z-[100]">
                                        <div className="bg-white p-2 rounded-2xl shadow-2xl border border-slate-200">
                                            <img src={card.image} alt="" className="w-full h-auto rounded-xl object-contain bg-slate-50" loading="lazy" />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                ))}
            </div>
        </section>
    );
}
