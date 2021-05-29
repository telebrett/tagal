import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { VarouselComponent } from './varousel.component';

describe('VarouselComponent', () => {
  let component: VarouselComponent;
  let fixture: ComponentFixture<VarouselComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ VarouselComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(VarouselComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
