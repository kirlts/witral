import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { BrainCircuit, MessageCircle, Sparkles } from "lucide-react";

export function Philosophy() {
    const { t } = useTranslation();

    return (
        <section className="relative w-full py-12 md:py-16 flex flex-col items-center justify-center px-4 bg-white border-t border-slate-200 overflow-hidden">


            <div className="max-w-4xl mx-auto w-full z-10">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.8 }}
                    className="text-center mb-10"
                >

                    <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
                        {t('philosophy.title')}
                    </h2>
                </motion.div>

                <div className="grid md:grid-cols-3 gap-6 relative z-10">
                    {/* The connector line behind the cards (desktop only) */}
                    <div className="hidden md:block absolute top-1/2 left-0 w-full h-px bg-slate-200 -z-10" />

                    {(t('philosophy.points', { returnObjects: true }) as Array<{ title: string, text: string }>).map((point, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.15, duration: 0.6 }}
                            className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow flex flex-col items-center text-center gap-4"
                        >
                            <div className={`p-3 rounded-2xl ${index === 0 ? 'bg-rose-50 text-rose-500' : index === 1 ? 'bg-blue-50 text-blue-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                {index === 0 ? <MessageCircle className="w-6 h-6" /> : index === 1 ? <BrainCircuit className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
                            </div>
                            <h3 className="font-bold text-xl text-slate-900">{point.title}</h3>
                            <p className="text-slate-600 leading-relaxed font-light text-center">{point.text}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
