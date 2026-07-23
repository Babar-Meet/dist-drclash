import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavComponent } from './layout/nav/nav.component';
import { FooterComponent } from './layout/footer/footer.component';
import { GoToTopComponent } from './shared/components/go-to-top.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavComponent, FooterComponent, GoToTopComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {}
