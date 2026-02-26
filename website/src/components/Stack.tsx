import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Code2, Cpu, ShieldCheck } from "lucide-react";

export function Stack() {
    const { t } = useTranslation();

    const features = [
        {
            id: "cli",
            icon: <Code2 className="w-6 h-6 text-pink-400" />
        },
        {
            id: "tech",
            icon: <Cpu className="w-6 h-6 text-blue-400" />
        },
        {
            id: "host",
            icon: <ShieldCheck className="w-6 h-6 text-green-400" />
        }
    ];

    return (
        <section className="relative w-full py-12 md:py-16 flex flex-col items-center justify-center px-4 bg-slate-50 border-t border-slate-200">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
                className="text-center mb-10 max-w-4xl mx-auto"
            >

                <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
                    {t('stack.title')}
                </h2>
                <p className="text-lg text-slate-600 max-w-2xl mx-auto font-light">
                    {t('stack.subtitle')}
                </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto w-full">
                {features.map((feat, i) => (
                    <motion.div
                        key={feat.id}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-50px" }}
                        transition={{ delay: i * 0.15, duration: 0.6 }}
                        className="bg-white border border-slate-200 p-8 rounded-3xl shadow-sm hover:shadow-md transition-shadow group"
                    >
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 group-hover:scale-110 transition-transform">
                                {feat.icon}
                            </div>
                            <h3 className="text-xl font-semibold text-slate-800">
                                {t(`stack.features.${feat.id}.title`)}
                            </h3>
                        </div>
                        <p className="text-slate-600 leading-relaxed font-light mt-4">
                            {t(`stack.features.${feat.id}.description`)}
                        </p>
                    </motion.div>
                ))}
            </div>
        </section>
    );
}
