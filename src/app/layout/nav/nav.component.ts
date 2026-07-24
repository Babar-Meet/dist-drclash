import { Component, HostListener, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-nav',
  imports: [RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './nav.component.html',
  styleUrl: './nav.component.css'
})
export class NavComponent {
  auth = inject(AuthService);
  menuOpen = false;
  showProfile = signal(false);
  editName = signal(false);
  nameInput = '';
  nameError = '';
  saving = signal(false);
  showDeleteConfirm = signal(false);
  deleting = signal(false);

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu() {
    this.menuOpen = false;
  }

  openProfile() {
    this.showProfile.set(true);
    this.editName.set(false);
    this.nameError = '';
    this.showDeleteConfirm.set(false);
  }

  closeProfile() {
    this.showProfile.set(false);
    this.editName.set(false);
  }

  startEditName() {
    this.nameInput = this.auth.user()?.username || '';
    this.nameError = '';
    this.editName.set(true);
  }

  cancelEdit() {
    this.editName.set(false);
    this.nameError = '';
  }

  async saveName() {
    this.nameError = '';
    this.saving.set(true);
    try {
      await this.auth.updateProfile(this.nameInput);
      this.editName.set(false);
    } catch (e: any) {
      this.nameError = e.message;
    }
    this.saving.set(false);
  }

  openDeleteConfirm() {
    this.showDeleteConfirm.set(true);
  }

  async confirmDelete() {
    this.deleting.set(true);
    try {
      await this.auth.deleteAccount();
      this.closeProfile();
    } catch {
      this.deleting.set(false);
    }
  }

  logout() {
    this.auth.logout();
    this.closeMenu();
    this.closeProfile();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.showProfile()) return;
    if (this.menuOpen) this.closeMenu();
  }
}
