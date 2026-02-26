import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { MessageCircle, TerminalSquare, HardDrive, ArrowRight } from "lucide-react";

export function Workflow() {
    const { t } = useTranslation();

    const steps = [
        {
            id: "source",
            icon: <MessageCircle className="w-10 h-10 text-emerald-500" />,
            border: "border-emerald-200",
            bg: "bg-emerald-50/50",
            glow: "shadow-[0_0_30px_-5px_rgba(52,211,153,0.15)]"
        },
        {
            id: "core",
            icon: <TerminalSquare className="w-10 h-10 text-slate-800" />,
            border: "border-slate-200",
            bg: "bg-white",
            glow: "shadow-[0_0_30px_-5px_rgba(0,0,0,0.05)]"
        },
        {
            id: "destination",
            icon: <HardDrive className="w-10 h-10 text-indigo-500" />,
            border: "border-indigo-200",
            bg: "bg-indigo-50/50",
            glow: "shadow-[0_0_30px_-5px_rgba(99,102,241,0.15)]"
        }
    ];

    return (
        <section className="relative w-full py-12 md:py-16 flex flex-col items-center justify-center px-4 overflow-hidden bg-white">

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
                className="text-center mb-10 max-w-3xl mx-auto"
            >

                <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
                    {t('workflow.title')}
                </h2>
                <p className="text-lg md:text-xl text-slate-600 leading-relaxed font-light">
                    {t('workflow.subtitle')}
                </p>
            </motion.div>

            <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-4 max-w-6xl mx-auto w-full relative z-10">
                {steps.map((step, i) => (
                    <div key={step.id} className="flex flex-col md:flex-row items-center w-full">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-50px" }}
                            transition={{ delay: i * 0.2, duration: 0.6 }}
                            className={`w-full relative p-8 rounded-3xl border ${step.border} ${step.bg} backdrop-blur-md ${step.glow} flex flex-col items-center text-center group hover:-translate-y-2 transition-all duration-500`}
                        >
                            <div className="mb-6 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm group-hover:scale-110 transition-transform duration-500">
                                {step.icon}
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900 mb-3">
                                {t(`workflow.steps.${step.id}.title`)}
                            </h3>
                            <p className="text-slate-600 leading-relaxed text-sm md:text-base">
                                {t(`workflow.steps.${step.id}.description`)}
                            </p>
                        </motion.div>

                        {/* Arrow Separator - Hide on last item or mobile */}
                        {i < steps.length - 1 && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.3 + 0.4, duration: 0.5 }}
                                className="hidden md:flex text-slate-300 px-2 flex-shrink-0"
                            >
                                <ArrowRight className="w-8 h-8" />
                            </motion.div>
                        )}
                        {/* Mobile divider */}
                        {i < steps.length - 1 && (
                            <div className="md:hidden h-12 border-l-2 border-dashed border-slate-200 my-2" />
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
}
