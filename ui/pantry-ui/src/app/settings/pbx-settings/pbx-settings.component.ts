
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatListModule } from '@angular/material/list';
import { MatTabsModule } from '@angular/material/tabs';

import { KioskService, Kiosk } from '../../services/kiosk.service';
import { SipService, SipConfig } from '../../services/sip.service';
import { Observable, of } from 'rxjs';

@Component({
    selector: 'app-pbx-settings',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatCardModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        MatSelectModule,
        MatSlideToggleModule,
        MatListModule,
        MatTabsModule
    ],
    templateUrl: './pbx-settings.component.html',
    styleUrls: ['./pbx-settings.component.css']
})
export class PbxSettingsComponent implements OnInit {
    kiosks$: Observable<Kiosk[]> = of([]);
    selectedKioskId: number | null = null;
    configForm: FormGroup;
    statusMessage: string = '';

    constructor(
        private kioskService: KioskService,
        private sipService: SipService,
        private fb: FormBuilder
    ) {
        this.configForm = this.fb.group({
            enabled: [false],
            domain: ['', Validators.required],
            username: ['', Validators.required],
            password: [''],
            extensions: this.fb.array([])
        });
    }

    ngOnInit() {
        this.kiosks$ = this.kioskService.getKiosks();

        // Listen for config updates
        this.sipService.config$.subscribe(config => {
            if (config && this.selectedKioskId) {
                this.patchForm(config);
            }
        });
    }

    get extensions() {
        return this.configForm.get('extensions') as FormArray;
    }

    addExtension() {
        this.extensions.push(this.fb.group({
            name: ['', Validators.required],
            number: ['', Validators.required]
        }));
    }

    removeExtension(index: number) {
        this.extensions.removeAt(index);
    }

    selectKiosk(kioskId: number) {
        if (this.selectedKioskId === kioskId) return;

        this.selectedKioskId = kioskId;
        this.statusMessage = 'Loading config...';

        // Reset form
        this.configForm.reset({ enabled: false });
        this.extensions.clear();

        this.sipService.getConfig(kioskId);
    }

    patchForm(config: SipConfig) {
        this.statusMessage = '';
        this.configForm.patchValue({
            enabled: config.enabled,
            domain: config.domain,
            username: config.username,
            password: config.password
        });

        this.extensions.clear();
        if (config.extensions) {
            config.extensions.forEach(ext => {
                this.extensions.push(this.fb.group({
                    name: [ext.name, Validators.required],
                    number: [ext.number, Validators.required]
                }));
            });
        }
    }

    save() {
        if (!this.selectedKioskId) return;
        if (this.configForm.invalid) return;

        const config: SipConfig = this.configForm.value;
        this.sipService.configure(this.selectedKioskId, config);
        this.statusMessage = 'Configuration saved and sent to Kiosk.';
    }
}
