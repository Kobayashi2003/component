import fixtureUrl from '../../../fixtures/corpus/svg-image-mixed.epub?url'
import noViewBoxUrl from '../../../fixtures/corpus/svg-image-no-viewbox.epub?url'
import { BrowserEpubReader } from '../../../core'
import { assert } from './harness'

export async function verifySvgImage(): Promise<string> {
  const bytes = await (await fetch(fixtureUrl)).arrayBuffer()
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;inset:0;width:1200px;height:500px;z-index:9999'
  document.body.append(container)
  let reader: BrowserEpubReader | undefined
  const assertFits = () => {
    const frame = container.querySelector('iframe')!
    const svg = frame.contentDocument!.querySelector('svg')!
    const box = svg.getBoundingClientRect()
    assert(
      box.width > 0 &&
        box.height > 0 &&
        box.top >= -1 &&
        box.left >= -1 &&
        box.bottom <= frame.clientHeight + 1 &&
        box.right <= frame.clientWidth + 1,
      'SVG must fit its actual viewport',
    )
    assert(Math.abs(box.width / box.height - 0.5) < 0.01, 'SVG ratio must be preserved')
  }
  try {
    reader = await BrowserEpubReader.open(bytes, container, { preferences: { spread: 'double' } })
    assertFits()
    assert(reader.snapshot.readingPosition?.atStart, 'cover is publication start')
    await reader.next()
    assert(Number(reader.snapshot.locator?.spineIndex) === 1, 'cover must navigate to prose')
    assert(
      container.querySelector('iframe')!.contentDocument!.querySelector('ruby'),
      'ruby survives',
    )
    let turns = 0
    while (reader.snapshot.locator?.spineIndex === 1 && turns++ < 30) await reader.next()
    assert(Number(reader.snapshot.locator?.spineIndex) === 2, 'prose must reach colophon')
    assertFits()
    const frame = container.querySelector('iframe')!
    assert(
      frame.getBoundingClientRect().right <= container.getBoundingClientRect().left + 610,
      'authored left colophon must occupy physical left leaf',
    )
    assert(
      reader.snapshot.renderer.layout?.pageCount === 1,
      'blank slot must not count as content page',
    )
    assert(
      reader.snapshot.readingPosition?.atEnd &&
        reader.snapshot.readingPosition.publicationProgression === 1,
      'visible book end must display 100 percent',
    )
    const locator = reader.snapshot.locator!
    assert(locator.locations.progression === 0, 'display completion must not rewrite locator')
    assert((await reader.next()).status === 'boundary', 'end must report boundary')
    await reader.setViewport({ width: 1400, height: 420 })
    assertFits()
    await reader.setPreferences({ spread: 'single' })
    assertFits()
    assert(reader.snapshot.readingPosition?.atEnd, 'single-page colophon remains book end')
    await reader.previous()
    assert(Number(reader.snapshot.locator?.spineIndex) === 1, 'previous must return to prose')
    await reader.goToLocator(locator)
    assertFits()
    await reader.setPreferences({ flow: 'scrolled' })
    assert(
      getComputedStyle(container.querySelector('iframe')!.contentDocument!.querySelector('svg')!)
        .position !== 'fixed',
      'scroll mode must retain publisher flow',
    )
    reader.dispose()
    reader = await BrowserEpubReader.open(bytes, container, {
      initialLocator: locator,
      preferences: { spread: 'double', compatibility: { fitSingleImagePages: false } },
    })
    assert(
      getComputedStyle(container.querySelector('iframe')!.contentDocument!.querySelector('svg')!)
        .position !== 'fixed',
      'SVG compatibility can be disabled',
    )
    reader.dispose()
    reader = await BrowserEpubReader.open(
      await (await fetch(noViewBoxUrl)).arrayBuffer(),
      container,
      {
        initialSpineIndex: 2,
        preferences: { spread: 'double' },
      },
    )
    assertFits()
    const fallbackFrame = container.querySelector('iframe')!
    const imageBox = fallbackFrame.contentDocument!.querySelector('image')!.getBoundingClientRect()
    assert(
      imageBox.bottom <= fallbackFrame.clientHeight + 1 && imageBox.top >= -1,
      'SVG without viewBox must scale the image coordinates as well as the canvas',
    )
    return 'mixed SVG cover/prose/colophon: fit, left placement, completion, unchanged locator, resize, navigation, scroll and disabled policy'
  } finally {
    reader?.dispose()
    container.remove()
  }
}
