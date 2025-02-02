import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../environments/environment';
import { Observable } from 'rxjs';

export interface Tag
{
  tagname: string
  taggroup: string
}

export interface TagGroup
{
  display: string
  code: string
}

@Injectable({
  providedIn: 'root'
})
export class TagsService {

  constructor(private http: HttpClient) { }

  private url = (a: string): string => {
    return environment.apiUrl + a;
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

  public GetGroups = (): Observable<TagGroup[]> => {
    return this.http.get<TagGroup[]>(this.url(`/tag-groups`));
  }

  public GetAllForGroup = (group: string): Observable<Tag[]> => {
    return this.http.get<Tag[]>(this.url(`/tag-groups/${group}`));
  }
}
