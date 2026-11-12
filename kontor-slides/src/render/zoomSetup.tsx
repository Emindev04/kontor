import { registerZoomRenderer } from './ElementView'
import { SlideView, presProps } from './SlideView'
import { store, useStore } from '../store/store'

registerZoomRenderer({
  usePres: () => useStore((s) => s.pres),
  Slide: ({ slide, index, scale }) => <SlideView slide={slide} index={index} {...presProps(store.get().pres)} mode="thumb" style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }} />,
})
