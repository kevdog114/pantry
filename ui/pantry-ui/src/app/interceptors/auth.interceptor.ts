import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { EnvironmentService } from '../services/environment.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const env = inject(EnvironmentService);
    if (req.url.startsWith(env.apiUrl)) {
        const authReq = req.clone({
            withCredentials: true
        });
        return next(authReq);
    }
    return next(req);
};
