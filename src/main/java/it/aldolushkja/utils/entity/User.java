package it.aldolushkja.utils.entity;

import io.quarkus.hibernate.orm.panache.PanacheEntity;
import java.util.Arrays;
import java.util.List;
import javax.persistence.Entity;
import javax.persistence.Table;

@Entity
@Table(name = "t_user")
public class User extends PanacheEntity {

  public String username;
  public String password;

  public static List<User> buildDefaultUsers() {
    User guest = new User();
    guest.username = "GUEST";
    guest.password = "GUEST";

    User admin = new User();
    admin.username = "ADMIN";
    admin.password = "PASSWORD";

    return Arrays.asList(guest, admin);

  }

  public User() {
  }


}
