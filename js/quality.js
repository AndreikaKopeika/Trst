// Пресеты графики. scale — доля разрешения экрана, в которой рисуется 3D (остальное дорисовывает апскейлер).
// dpr — предел плотности пикселей итоговой картинки (интерфейс всегда чёткий).
export const PRESETS = {
  low: { name: 'Низкая', dpr: 1.15, scale: 0.64, msaa: 0, bloom: 0, shadows: 0, far: 72, grade: 0.6, vig: 0, sharp: 0.85, clouds: false, fx: 0.5 },
  med: { name: 'Средняя', dpr: 1.5, scale: 0.72, msaa: 0, bloom: 0, shadows: 0, far: 100, grade: 1, vig: 0.3, sharp: 0.7, clouds: true, fx: 1 },
  high: { name: 'Высокая', dpr: 2, scale: 0.75, msaa: 2, bloom: 0.45, shadows: 1024, far: 140, grade: 1, vig: 0.35, sharp: 0.55, clouds: true, fx: 1 },
  ultra: { name: 'Ультра', dpr: 2.5, scale: 1, msaa: 4, bloom: 0.55, shadows: 2048, far: 190, grade: 1, vig: 0.38, sharp: 0.35, clouds: true, fx: 1.4 },
};
export function preset(q) { return PRESETS[q] || PRESETS.med; }
