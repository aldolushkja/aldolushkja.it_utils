package org.acme.lifecycle;

public enum DigestType {
  SHA256("SHA-256"), SHA512("SHA-512"), SHA1("SHA-1");

  DigestType(String string) {
    this.value = string;
  }

  private String value;

  public String getValue() {
    return value;
  }



}
