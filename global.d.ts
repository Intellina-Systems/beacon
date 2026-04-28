declare module '*.css'

declare module 'pdf-parse/lib/pdf-parse.js' {
  import type PdfParse from 'pdf-parse'

  const pdfParse: typeof PdfParse
  export default pdfParse
}
