import { AfterViewInit, Component } from '@angular/core';
import { Tag, TagGroup, TagsService } from '../tags.service';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

interface TagsByGroup
{
  group: TagGroup,
  tags: Tag[]
}

@Component({
  selector: 'app-tags',
  imports: [
    MatCardModule,
    MatInputModule,
    MatIconModule,
    CommonModule,
    FormsModule,
    MatButtonModule
  ],
  templateUrl: './tags.component.html',
  styleUrl: './tags.component.css'
})
export class TagsComponent implements AfterViewInit {

  public tags: TagsByGroup[] = [];
  
  constructor(private svc: TagsService) {
    
  }
  ngAfterViewInit(): void {
    this.svc.GetGroups().subscribe(groups => {
      this.tags = groups.map(g => {
        return {
          group: g,
          tags: []
        }
      });


      this.svc.GetAll().subscribe(tags => {
        tags.forEach(tag => {
          var matchingGroup = this.tags.find(a => a.group.code == tag.taggroup);
          if(matchingGroup)
          {
            matchingGroup.tags.push(tag);
          }
        })
      })
    });
  }

  public addTag = (tag: TagsByGroup) => {
    tag.tags.push({
      taggroup: tag.group.code,
      tagname: ""
    })
  }

  public removeTagItem = (tag: TagsByGroup, tagItem: Tag) => {
    tag.tags.splice(tag.tags.indexOf(tagItem), 1);
  }
}
