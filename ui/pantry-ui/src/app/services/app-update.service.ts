import { ApplicationRef, Injectable, isDevMode } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { concat, interval } from 'rxjs';
import { filter, first } from 'rxjs/operators';

/**
 * Notices new deployments and gets the browser onto them.
 *
 * The service worker was registered but nothing ever listened to it, so a new
 * build downloaded quietly and only took effect on some later cold load —
 * hence "it takes a few refreshes", and two devices refreshed at the same
 * moment sitting on different versions.
 *
 * Now the app polls for a new build and acts as soon as one is ready:
 *   - kiosk (no one to ask): activate and reload immediately
 *   - everywhere else: offer a Reload button rather than yanking the page
 *     out from under someone mid-sentence
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
    /** How often to ask the server whether a new build exists. */
    private static readonly CHECK_INTERVAL_MS = 60_000;

    private started = false;

    constructor(
        private updates: SwUpdate,
        private appRef: ApplicationRef,
        private snackBar: MatSnackBar
    ) { }

    /**
     * @param autoReload true on the kiosk: no one is there to tap a button,
     *   and a wall display showing a stale build is worse than a brief reload.
     */
    start(autoReload = false): void {
        if (this.started || isDevMode() || !this.updates.isEnabled) return;
        this.started = true;

        this.updates.versionUpdates
            .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
            .subscribe(() => this.onVersionReady(autoReload));

        // A broken build can leave the worker unable to serve the app at all;
        // a hard reload is the only way out of that.
        this.updates.unrecoverable.subscribe(() => {
            this.snackBar.open('Update problem — reloading', '', { duration: 3000 });
            setTimeout(() => document.location.reload(), 1500);
        });

        // Poll, but only once the app has settled: checking during startup
        // competes with the initial load. Angular never reports "stable" while
        // a repeating timer is pending, so the interval starts after the first
        // stable event rather than being part of what is awaited.
        const stable$ = this.appRef.isStable.pipe(first(s => s === true));
        concat(stable$, interval(AppUpdateService.CHECK_INTERVAL_MS)).subscribe(() => {
            this.updates.checkForUpdate().catch(() => undefined);
        });
    }

    private onVersionReady(autoReload: boolean): void {
        if (autoReload) {
            this.updates.activateUpdate().then(() => document.location.reload());
            return;
        }
        const ref = this.snackBar.open('A new version is available', 'Reload', { duration: 0 });
        ref.onAction().subscribe(() => {
            this.updates.activateUpdate().then(() => document.location.reload());
        });
    }
}
