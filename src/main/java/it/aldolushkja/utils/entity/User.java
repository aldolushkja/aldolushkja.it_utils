package it.aldolushkja.utils.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntity;
import java.util.ArrayList;
import java.util.List;
import javax.persistence.Entity;
import javax.persistence.Table;

@Entity
@Table(name = "contabo_user")
public class User extends PanacheEntity {

  private String username;
  private String password;

  public User(String username, String password) {
    super();
    this.username = username;
    this.password = password;
  }

  public static List<User> buildRandomUser() {
    List<User> users = new ArrayList<>();
    for (int i = 0; i < 20; i++) {
      users.add(new User("duke" + i, "heyduke"));
    }
    return users;
  }

  public User() {
  }

  public Long getId() {
    return id;
  }

  public void setId(Long id) {
    this.id = id;
  }

  public String getUsername() {
    return username;
  }

  public void setUsername(String username) {
    this.username = username;
  }

  public String getPassword() {
    return password;
  }

  public void setPassword(String password) {
    this.password = password;
  }


}
