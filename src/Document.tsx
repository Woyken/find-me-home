import type { ParentProps } from 'solid-js'

export default function Document(props: ParentProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Find Me Home</title>
      </head>
      <body>{props.children}</body>
    </html>
  )
}
