import { createSignal } from 'solid-js'
import { createAruodasBookmarklet } from '../imports/bookmarklet'
import { Modal } from './Modal'
import { showToast } from './Toast'

const [open, setOpen] = createSignal(false)

/** Opens the "Add a plot from Aruodas" dialog from anywhere in the app. */
export const openAddPlotDialog = () => setOpen(true)

const bookmarkHref = () =>
  createAruodasBookmarklet(
    new URL(import.meta.env.BASE_URL, window.location.origin).toString(),
  )

const copy = async (text: string, message: string) => {
  try {
    await navigator.clipboard.writeText(text)
    showToast(message)
  } catch {
    showToast('Could not copy — long-press the button instead')
  }
}

/** Three-step setup of the Find Me Home bookmark. Mount once, in App. */
export function AddPlotDialog() {
  return (
    <Modal
      open={open()}
      onClose={() => setOpen(false)}
      label="Add a plot from Aruodas"
    >
      <h2>Add a plot from Aruodas</h2>
      <p>Set this up once; after that it's one click per plot.</p>
      <ol class="steps">
        <li>
          <div>
            Drag this button to your browser's bookmarks bar.
            <br />
            <a
              class="drag"
              href={bookmarkHref()}
              onClick={(event) => event.preventDefault()}
            >
              Save to Find Me Home
            </a>
            <br />
            <small>
              On a phone:{' '}
              <button
                class="linkbtn"
                type="button"
                onClick={() =>
                  void copy(bookmarkHref(), 'Bookmark link copied')
                }
              >
                copy the link
              </button>{' '}
              and add it as a bookmark by hand.
            </small>
          </div>
        </li>
        <li>
          <div>
            Open a land advert on aruodas.lt — or your favourites page to add
            many at once.
          </div>
        </li>
        <li>
          <div>Click the bookmark. The plot appears here, ready to review.</div>
        </li>
      </ol>
    </Modal>
  )
}
