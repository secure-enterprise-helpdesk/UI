import { Component } from '@angular/core';
import { WorkspaceComponent } from './workspace.component';

@Component({
  selector: 'app-root',
  imports: [WorkspaceComponent],
  template: '<app-workspace />',
  styleUrl: './app.scss'
})
export class App {}
