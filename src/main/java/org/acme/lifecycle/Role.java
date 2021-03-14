package org.acme.lifecycle;

public enum Role {
  ADMIN("ADMIN"), GUEST("GUEST"), USER("USER"), ANONYMOUS("ANONYMOUS");

  private String value;

  private Role(String value) {
    this.value = value;
  }

}
