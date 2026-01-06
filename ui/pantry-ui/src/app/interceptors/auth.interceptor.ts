import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    if (req.url.startsWith(environment.apiUrl)) {
        const authReq = req.clone({
            withCredentials: true
        });
        return next(authReq);
    }
    return next(req);
};
