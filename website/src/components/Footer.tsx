import { Github, Linkedin, Globe } from "lucide-react";

export function Footer() {
    return (
        <footer className="relative w-full py-16 px-4 bg-slate-900 border-t border-slate-800 text-slate-400 overflow-hidden">

            <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-10">
                {/* Creator Info */}
                <div className="flex flex-col items-center md:items-start text-center md:text-left space-y-3">
                    <h3 className="text-3xl font-bold text-white tracking-tight">
                        Martín Gil
                    </h3>
                    <div className="space-y-4">
                        <p className="text-emerald-400 font-medium tracking-wide">
                            AI Solutions Architect
                        </p>
                        <p className="text-slate-400 text-sm max-w-md leading-relaxed text-justify">
                            Soy Ingeniero Informático (UNAB) y me especializo en la modernización de sistemas legados y la arquitectura de soluciones web escalables. Mi enfoque de desarrollo integra la Inteligencia Artificial como un motor de aceleración supervisado, garantizando rigor arquitectónico y diseño estructurado en el ciclo de vida del software.
                        </p>
                    </div>
                </div>

                {/* Social Links */}
                <div className="flex items-center gap-4">
                    <a
                        href="https://github.com/kirlts/validadorQM"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 bg-slate-800 rounded-xl hover:bg-slate-700 hover:text-white transition-all hover:scale-110 border border-slate-700 hover:border-emerald-500/50"
                        title="GitHub"
                    >
                        <Github className="w-5 h-5" />
                    </a>
                    <a
                        href="https://linkedin.com/in/martin-gil-o"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 bg-slate-800 rounded-xl hover:bg-slate-700 hover:text-white transition-all hover:scale-110 border border-slate-700 hover:border-emerald-500/50"
                        title="LinkedIn"
                    >
                        <Linkedin className="w-5 h-5" />
                    </a>
                    <a
                        href="https://validadorqm.exposmart.cl"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 bg-slate-800 rounded-xl hover:bg-slate-700 hover:text-white transition-all hover:scale-110 border border-slate-700 hover:border-emerald-500/50"
                        title="Validador QM"
                    >
                        <Globe className="w-5 h-5" />
                    </a>
                </div>
            </div>

            <div className="max-w-4xl mx-auto mt-12 pt-8 border-t border-slate-800 flex flex-col items-center justify-center text-sm text-slate-600">
                <p>© {new Date().getFullYear()} Witral Project. Diseñado y desarrollado por Martín Gil.</p>
            </div>
        </footer>
    );
}
