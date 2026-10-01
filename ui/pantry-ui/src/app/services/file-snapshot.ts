import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Reads a picked file into memory and returns it as a Blob with a known length.
 *
 * A File taken straight from the iOS photo library is a lazy handle: Safari
 * will happily emit the multipart headers and then send Content-Length: 0,
 * silently dropping every field in the form. FileReader can read the same
 * file, so snapshotting the bytes into a Blob gives XHR something it cannot
 * serialize away. Every multipart upload of a user-picked file should go
 * through this.
 */
export function snapshotFile(file: File): Observable<Blob> {
  return from(file.arrayBuffer()).pipe(
    map(buffer => {
      // If the handle really is dead we get 0 bytes here. Fail loudly rather
      // than posting an empty body that the server can only reject with a
      // confusing 400.
      if (!buffer || buffer.byteLength === 0) {
        throw new Error(
          `Could not read "${file.name || 'image'}" — the file came back empty. ` +
          `Try taking a screenshot of it, or re-saving it to Photos, then attach it again.`
        );
      }
      return new Blob([buffer], { type: file.type || 'application/octet-stream' });
    })
  );
}
