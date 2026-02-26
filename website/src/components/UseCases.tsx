import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { MessageSquareText, FileText, CheckCircle2 } from "lucide-react";

export function UseCases() {
    const { t } = useTranslation();

    const cases = [
        {
            id: "append",
            icon: <MessageSquareText className="w-6 h-6 text-emerald-500" />,
            image: `${import.meta.env.BASE_URL}images/image-append-tag-example.webp`
        },
        {
            id: "newfile",
            icon: <FileText className="w-6 h-6 text-blue-500" />,
            image: `${import.meta.env.BASE_URL}images/image-newfile-tag-example.webp`
        }
    ];

    return (
        <section className="relative w-full py-12 md:py-16 flex flex-col items-center justify-center px-4 bg-slate-50 border-t border-slate-200">

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8 }}
                className="text-center mb-10 max-w-4xl mx-auto z-10"
            >

                <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-6">
                    {t('usecases.title')}
                </h2>
                <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                    {t('usecases.subtitle')}
                </p>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto w-full z-10">
                {cases.map((useCase, i) => (
                    <motion.div
                        key={useCase.id}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-50px" }}
                        transition={{ delay: i * 0.15, duration: 0.6 }}
                        className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow relative group flex flex-col h-full"
                    >
                        <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
                            {/* Status Icon Decoration */}
                            <div className="absolute top-6 right-6 text-slate-200 group-hover:text-emerald-100 transition-colors">
                                <CheckCircle2 className="w-24 h-24 absolute -top-8 -right-8 opacity-20" />
                            </div>
                        </div>

                        <div className="flex items-center gap-4 mb-6 relative z-10">
                            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm">
                                {useCase.icon}
                            </div>
                            <h3 className="text-xl font-bold text-slate-800">
                                {t(`usecases.cases.${useCase.id}.title`)}
                            </h3>
                        </div>

                        {/* Simulate WhatsApp Message Bubble */}
                        <div className="relative mb-6">
                            <div className="bg-emerald-50 border border-emerald-100/50 rounded-2xl rounded-tl-sm p-4 w-11/12 shadow-sm relative z-10">
                                <p className="font-mono text-sm text-emerald-800 break-words">
                                    {t(`usecases.cases.${useCase.id}.trigger`)}
                                </p>
                            </div>
                            {/* Decorative Tail */}
                            <svg className="absolute top-0 -left-2 w-3 h-4 text-emerald-50 fill-current" viewBox="0 0 8 13" xmlns="http://www.w3.org/2000/svg">
                                <path d="M1.533 3.118C0.324 2.21 0 1.05 0 0v13l4.22-3.876c1.3-.98 2.05-2.52 2.05-4.14 0-1.84-1.2-3.44-2.906-4.053l-1.83-1.813z" />
                            </svg>
                        </div>

                        <p className="text-slate-600 leading-relaxed relative z-10 mb-6 text-justify flex-grow">
                            {t(`usecases.cases.${useCase.id}.description`)}
                        </p>

                        {/* Image Preview with Hover Reveal */}
                        {useCase.image && (
                            <div className="mt-auto relative group/img w-full z-20">
                                {/* Thumbnail */}
                                <div className="w-full h-64 rounded-xl overflow-hidden shadow-sm transition-transform duration-300 bg-slate-100 flex items-start justify-center border border-slate-200 cursor-pointer">
                                    <img src={useCase.image} alt={t(`usecases.cases.${useCase.id}.title`)} className="w-full h-full object-cover object-top opacity-90 group-hover/img:opacity-100 transition-opacity rounded-xl" loading="lazy" />
                                </div>

                                {/* Hover Pop-out Full Image */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] w-[130%] min-w-[320px] scale-90 opacity-0 pointer-events-none group-hover/img:scale-100 group-hover/img:opacity-100 group-hover/img:pointer-events-auto transition-all duration-300 origin-center drop-shadow-2xl z-[100]">
                                    <div className="bg-white p-2 rounded-2xl shadow-2xl border border-slate-200">
                                        <img src={useCase.image} alt="" className="w-full h-auto rounded-xl object-contain bg-slate-50" loading="lazy" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>
        </section >
    );
}
