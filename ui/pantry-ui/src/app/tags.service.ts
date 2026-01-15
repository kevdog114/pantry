import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { EnvironmentService } from './services/environment.service';
import { Observable } from 'rxjs';

export interface Tag {
  id: number
  name: string
  group: string
  _count?: {
    barcodes: number
  }
}

export interface TagGroup {
  display: string
  code: string
}

@Injectable({
  providedIn: 'root'
})
export class TagsService {

  constructor(private http: HttpClient, private env: EnvironmentService) { }

  private url = (a: string): string => {
    return this.env.apiUrl + a;
  }

  public GetAll = (): Observable<Tag[]> => {
    return this.http.get<Tag[]>(this.url("/tags"));
  }

  public GetById = (id: number): Observable<Tag> => {
    return this.http.get<Tag>(this.url(`/tags/${id}`));
  }

  public Create = (tag: Tag): Observable<Tag> => {
    return this.http.post<Tag>(this.url(`/tags/`), tag);
  }

  public UpdateById = (id: number, tag: Tag): Observable<Tag> => {
    return this.http.put<Tag>(this.url(`/tags/${id}`), tag);
  }

  public Delete = (id: number): Observable<any> => {
    return this.http.delete(this.url(`/tags/${id}`));
  }

  public GetGroups = (): Observable<TagGroup[]> => {
    return this.http.get<TagGroup[]>(this.url(`/tag-groups`));
  }

  public GetAllForGroup = (group: string): Observable<Tag[]> => {
    return this.http.get<Tag[]>(this.url(`/tag-groups/${group}`));
  }
}
