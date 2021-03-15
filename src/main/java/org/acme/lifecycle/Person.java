package org.acme.lifecycle;

// @MongoEntity(database = "person")
public class Person {
  // extends PanacheMongoEntity {
  public String name;
  public String password;
  public Role role;



  public Person() {
    super();
  }

  public Person(String name, String password, Role role) {
    super();
    this.name = name;
    this.password = password;
    this.role = role;
  }

  public static Person buildAdmin(String name) {
    return new Person(name, "AdminPasswordRocks", Role.ADMIN);
  }

  public static Person buildGuest(String name) {
    return new Person(name, "GuestPasswordRocks", Role.GUEST);
  }

  // public static Person findByName(String name) {
  // return find("name", name).firstResult();
  // }
  //
  // public static List<Person> findByRoleName(String roleName) {
  // return list("role", Role.valueOf(roleName));
  // }
  //
  // public static List<Person> findAdmins() {
  // return list("role", Role.ADMIN);
  // }
  //
  // public static void deleteLoics() {
  // delete("name", "Loïc");
  // }
}
